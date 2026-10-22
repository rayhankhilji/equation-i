// Equation I - circuit geometry, elevation, lookups and the track surface meshes
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const STEP = 2.0;

  // default elevation profile (Silverstone) keyed by distance along the lap (metres); other circuits carry data.elevation
  const ELEV = [[0, 0], [300, 0.8], [440, 1.5], [660, 4], [940, 5.5], [1010, 5.5], [1255, 4.5], [1350, 3.2], [1700, 1], [1973, -1.5], [2168, -2], [2500, -0.5], [2735, 0], [3085, 1], [3630, 3.5], [3875, 5], [4033, 4], [4300, 2.5], [4650, 1], [5028, 2.5], [5240, -2.5], [5570, -3], [5640, -1.5], [5878, 0]];

  // ---------------------------------------------------------------- surface shaders (MeshStandardMaterial + per-pixel track-space detail)
  const SH_COMMON = [
    'uniform sampler2D eiAux; uniform vec4 eiSP; uniform float eiHW; uniform float eiKW;',
    'float eiHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float eiBox(float x, float a, float b, float w) { return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }',
  ].join('\n');
  const VARY4 = {
    v: 'attribute vec4 trk; attribute vec4 trk2; varying vec4 vTrk; varying vec4 vTrk2;',
    vm: 'vTrk = trk; vTrk2 = trk2;',
    f: 'varying vec4 vTrk; varying vec4 vTrk2;',
  };
  const VARY_RUN = {
    v: 'attribute vec4 trk; attribute vec4 trk2; attribute vec3 colA; attribute vec3 colB; varying vec4 vTrk; varying vec4 vTrk2; varying vec3 vColA; varying vec3 vColB;',
    vm: 'vTrk = trk; vTrk2 = trk2; vColA = colA; vColB = colB;',
    f: 'varying vec4 vTrk; varying vec4 vTrk2; varying vec3 vColA; varying vec3 vColB; uniform vec3 eiGT;',
  };
  // run-off with a house colour (Yas): one more per-row attribute for the painted straights (red / white band, dark brand band)
  const VARY_RUN_RC = {
    v: VARY_RUN.v + ' attribute vec4 trk3; varying vec4 vTrk3;',
    vm: VARY_RUN.vm + ' vTrk3 = trk3;',
    f: VARY_RUN.f + ' varying vec4 vTrk3; uniform sampler2D eiBrand;',
  };
  const VARY_VERGE = {
    v: 'attribute vec4 trk; attribute vec3 farL; attribute vec3 farR; varying vec4 vTrk; varying vec3 vFarL; varying vec3 vFarR; varying vec3 vWp;',
    vm: 'vTrk = trk; vFarL = farL; vFarR = farR; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    f: 'varying vec4 vTrk; varying vec3 vFarL; varying vec3 vFarR; varying vec3 vWp; uniform sampler2D eiField; uniform sampler2D eiDetail; uniform float eiFieldOn; uniform float eiMapHalf; uniform vec3 eiGrassMean;',
  };
  // asphalt: macro tone, paving lanes, repaired strips, sealed cracks, rubbered line with tyre streaks (heavier under braking),
  // marbles off line on the outside of corners, dusty edges, crisp worn white edge lines
  const ASPHALT_FRAG = `
    float eLat = vTrk.x, eS = vTrk.y, eD = eLat - vTrk.z, eBrk = vTrk.w;
    float eK = vTrk2.x, eCorner = abs(eK), eExit = vTrk2.y, eDirt = vTrk2.z;
    float eAl = abs(eLat); float eAA = max(fwidth(eLat), 0.002); float eAS = max(fwidth(eS), 0.002);
    vec3 eCol = diffuseColor.rgb;
    vec4 eM1 = texture2D(eiAux, vec2(eLat * 0.021 + 0.13, eS * eiSP.x));
    vec4 eM2 = texture2D(eiAux, vec2(eLat * 0.071 + 0.61, eS * eiSP.y));
    eCol *= 0.86 + 0.28 * eM1.r;
    // repair patches / resurfacing: edges wander with the low-frequency noise and are soft (a patch is not a ruled rectangle lying on the road)
    float ePw = eLat + (eM2.g - 0.5) * 0.4, ePs = eS + (eM1.g - 0.5) * 2.2; float ePA = max(eAA, 0.12), ePS = max(eAS, 0.6);
    eCol *= mix(vec3(1.0), vec3(1.05, 1.02, 0.95), smoothstep(0.35, 0.75, eM2.r));
    float eLane = floor((eLat + eiHW) / (2.0 * eiHW / 3.0));
    eCol *= 0.965 + 0.07 * eiHash(vec2(eLane, 7.0));
    float eSeg = floor(eS / 34.0); float eh = eiHash(vec2(eSeg, 3.1)); float ePatch = 0.0, eSeam = 0.0;
    if (eh > 0.7) {
      float pc = (eiHash(vec2(eSeg, 9.7)) - 0.5) * eiHW * 1.3; float pw = 0.9 + eiHash(vec2(eSeg, 1.3)) * 2.8;
      float ps0 = eSeg * 34.0 + eiHash(vec2(eSeg, 5.5)) * 10.0; float ps1 = ps0 + 5.0 + eiHash(vec2(eSeg, 2.2)) * 18.0;
      ePatch = eiBox(ePw, pc - pw * 0.5, pc + pw * 0.5, ePA) * eiBox(ePs, ps0, ps1, ePS);
      eSeam = max(eiBox(ePw, pc - pw * 0.5 - 0.1, pc + pw * 0.5 + 0.1, ePA) * eiBox(ePs, ps0 - 0.1, ps1 + 0.1, ePS) - ePatch, 0.0) * smoothstep(0.35, 0.6, eM1.g);
    }
    eCol = mix(eCol, mix(eCol, vec3(dot(eCol, vec3(0.33))), 0.4) * vec3(0.92, 0.92, 0.935) * (0.95 + 0.1 * eM2.r), ePatch * 0.8);
    eCol *= 1.0 - 0.14 * eSeam;
#ifdef EI_STREET
    // Monaco's public-road asphalt (F1 photo set): a neutral-to-cool dark grey, not the warm grey of a purpose-built circuit (MONACO-UPGRADE)
    eCol = mix(eCol, vec3(dot(eCol, vec3(0.3333))), 0.65) * vec3(0.8, 0.83, 0.88);
    // street circuit: a patchwork of resurfacing (newer, darker and finer repairs and older greyer ones), bitumen sealer lines
    // snaking along and across the lanes over the seams and cracks, glossy where they catch the sun
    float eSeal = 0.0;
    { float sg = floor((eS + 11.0) / 23.0); float hh = eiHash(vec2(sg, 7.7));
      if (hh > 0.42) { float pc = (eiHash(vec2(sg, 2.3)) - 0.5) * eiHW * 1.5; float pw = 1.2 + eiHash(vec2(sg, 8.1)) * 3.6; float ps0 = sg * 23.0 - 11.0 + eiHash(vec2(sg, 3.9)) * 6.0; float ps1 = ps0 + 3.5 + eiHash(vec2(sg, 6.6)) * 13.0;
        float pin = eiBox(ePw, pc - pw * 0.5, pc + pw * 0.5, ePA) * eiBox(ePs, ps0, ps1, ePS); float pse = max(eiBox(ePw, pc - pw * 0.5 - 0.1, pc + pw * 0.5 + 0.1, ePA) * eiBox(ePs, ps0 - 0.1, ps1 + 0.1, ePS) - pin, 0.0) * smoothstep(0.3, 0.6, eM1.g);
        float newer = step(0.5, eiHash(vec2(sg, 4.4)));
        eCol = mix(eCol, newer > 0.5 ? eCol * vec3(0.78, 0.78, 0.8) : mix(eCol, vec3(dot(eCol, vec3(0.33))), 0.7) * 1.14, pin * (0.75 + 0.25 * eM1.g)); eSeal = max(eSeal, pse * 0.5); }
      float cl = floor(eS / 13.0); float h2 = eiHash(vec2(cl, 1.9));
      if (h2 > 0.55) { float c0 = (eiHash(vec2(cl, 5.1)) - 0.5) * eiHW * 1.6; float cc = c0 + 0.55 * sin(eS * 0.31 + h2 * 6.28) + 0.18 * sin(eS * 1.7 + h2 * 3.1);
        float cw = 0.022 + 0.022 * eiHash(vec2(cl, 9.3)); float ca = cl * 13.0 + eiHash(vec2(cl, 3.3)) * 5.0; float cb = ca + 4.0 + eiHash(vec2(cl, 7.2)) * 9.0;
        eSeal = max(eSeal, (1.0 - smoothstep(cw, cw + eAA, abs(eLat - cc))) * eiBox(eS, ca, cb, eAS)); }
      float tl = floor(eS / 17.0); float h3 = eiHash(vec2(tl, 6.2));
      if (h3 > 0.62) { float t0 = tl * 17.0 + 8.5 + 0.35 * sin(eLat * 0.8 + h3 * 9.0) + 0.12 * sin(eLat * 3.1); float la = (eiHash(vec2(tl, 1.1)) - 0.7) * eiHW, lb = la + eiHW * (0.6 + eiHash(vec2(tl, 2.6)));
        eSeal = max(eSeal, (1.0 - smoothstep(0.04, 0.04 + eAS, abs(eS - t0))) * eiBox(eLat, la, lb, eAA)); }
      eSeal *= 1.0 - smoothstep(eiHW - 0.35, eiHW - 0.2, eAl);
      eCol = mix(eCol, vec3(0.035, 0.035, 0.037), eSeal * 0.72); }
#endif
    float eCr = texture2D(eiAux, vec2(eLat * 0.09 + 0.4, eS * eiSP.z * 2.0)).a * smoothstep(0.45, 0.7, eM1.g);
    eCol *= 1.0 - 0.28 * eCr * (1.0 - ePatch);
    float eRw = 1.2 + 0.6 * eCorner + 0.4 * eBrk;
    float eRub = exp(-eD * eD / (2.0 * eRw * eRw));
    float eTT = exp(-pow(abs(eD) - 0.8, 2.0) / (2.0 * 0.3 * 0.3));
    float eSt = texture2D(eiAux, vec2(eD * 0.21 + 0.5, eS * eiSP.w)).g;
    float eSt2 = texture2D(eiAux, vec2(eD * 0.47 + 0.2, eS * eiSP.w * 1.7)).g;
    float eRubber = eRub * (0.36 + 0.3 * eSt) + eTT * 0.3 * eSt2;
    float eLock = smoothstep(0.6, 0.75, eSt2) * exp(-eD * eD / 5.0);
    eRubber += eBrk * (0.35 * eRub + 0.6 * eLock);
    eRubber += eExit * eTT * 0.4 * smoothstep(0.45, 0.7, eSt);
    eRubber = clamp(eRubber * (1.0 - smoothstep(eiHW - 0.5, eiHW, eAl)), 0.0, 0.9);
    eCol = mix(eCol, eCol * vec3(0.34, 0.34, 0.36), eRubber);
    float eOut = -eD * sign(eK);
    float eMz = eCorner * smoothstep(1.8, 3.6, eOut) * (1.0 - smoothstep(eiHW - 0.4, eiHW - 0.1, eAl));
    vec4 eSp = texture2D(eiAux, vec2(eLat * 0.37 + 0.71, eS * eiSP.y * 4.0));
    float eDark = smoothstep(0.85, 0.95, eSp.b), eLite = smoothstep(0.35, 0.42, eSp.b) * (1.0 - eDark);
    eCol = mix(eCol, eCol * 1.12 + vec3(0.014, 0.012, 0.009), eMz * 0.5);
    eCol = mix(eCol, vec3(0.42, 0.40, 0.36), eMz * eLite * 0.85);
    eCol = mix(eCol, vec3(0.02), eMz * eDark * 0.8);
    float eEd = smoothstep(eiHW - 2.4, eiHW - 0.1, eAl);
    float eDs = texture2D(eiAux, vec2(eLat * 0.6, eS * eiSP.w * 0.6)).g;
    float eDirtA = clamp(eEd * (0.25 + 0.75 * eDirt) * (0.45 + 0.9 * eDs) * (1.0 - eRubber), 0.0, 1.0);
    eCol = mix(eCol, vec3(0.25, 0.21, 0.155), eDirtA * 0.55);
    float ePaint = smoothstep(eiHW - 0.2 - eAA, eiHW - 0.2 + eAA, eAl);
    float eWear = smoothstep(0.55, 0.85, eM2.g) * 0.45 + eCr * 0.6 + eLite * eMz * 0.4;
    vec3 eWhite = vec3(0.74, 0.74, 0.72) * (0.92 + 0.1 * eM1.r);
    eWhite = mix(eWhite, vec3(0.42, 0.39, 0.34), eDirtA * 0.45);
    ePaint *= 1.0 - clamp(eWear, 0.0, 0.7);
    eCol = mix(eCol, eWhite, ePaint);
#ifdef EI_STREET
    // baked sun shade of the buildings on the road (streetShade): the whole lap on Low (no shadow map there), beyond the shadow box on
    // Medium / High (eiShdK 2: faded in past ~75 m, where the live shadow map stops)
    { float sk = eiShdK > 1.5 ? smoothstep(68.0, 90.0, length(vViewPosition)) : eiShdK;
      if (sk > 0.0) { float sh = texture2D(eiShd, vec2(eS * eiShdL, clamp(eLat / eiHW, -1.0, 1.0) * 0.47 + 0.5)).r; eCol *= mix(1.0, 0.36 + 0.64 * sh, sk); } }
#endif
    diffuseColor.rgb = eCol;
  `;
  const ASPHALT_ROUGH = `
    roughnessFactor = clamp(roughnessFactor * (1.0 - 0.38 * eRubber) + eDirtA * 0.2, 0.3, 1.0);
    roughnessFactor = mix(roughnessFactor, 0.55, ePaint);
    float eiFlat = clamp(ePaint * 0.85 + eRubber * 0.55 + ePatch * 0.35, 0.0, 1.0);
#ifdef EI_STREET
    roughnessFactor = mix(roughnessFactor, 0.26, eSeal);
#endif
  `;
  const FLATTEN = 'normal = normalize(mix(normal, eiGeoN, eiFlat));';
  // run-off: shoulder asphalt, green strip behind kerbs, colour-blocked paint with white borders and weathering, gravel spill
  const RUNOFF_FRAG = `
    float rLat = vTrk.x, rS = vTrk.y, rAl = abs(rLat); float rAA = max(fwidth(rAl), 0.002);
    float aw0 = vTrk2.z, rOuter = vTrk2.w, rGS = vTrk2.y;
    vec3 rCol = diffuseColor.rgb;
    vec4 rM1 = texture2D(eiAux, vec2(rLat * 0.031 + 0.3, rS * eiSP.x));
    vec4 rM2 = texture2D(eiAux, vec2(rLat * 0.093, rS * eiSP.y));
    rCol *= 0.86 + 0.26 * rM1.r;
    float rCr = texture2D(eiAux, vec2(rLat * 0.05 + 0.1, rS * eiSP.z)).a;
    rCol *= 1.0 - 0.45 * rCr;
    vec3 rBase = rCol;
    float rGw = fwidth(vTrk2.x); float rGon = smoothstep(0.5 - rGw, 0.5 + rGw, vTrk2.x);
    float rPw = fwidth(vTrk.z); float rPon = smoothstep(0.44 - rPw, 0.44 + rPw, vTrk.z);
    float rGreen = rGon * eiBox(rAl, eiHW + eiKW - 0.05, aw0, rAA);
    vec3 rGreenC = vec3(0.13, 0.235, 0.105) * (0.85 + 0.3 * rM2.r);
    float rWear = smoothstep(0.5, 0.85, rM2.r) * 0.55 + rCr * 0.5;
    vec4 rTy = texture2D(eiAux, vec2((rAl * 0.9 - rS * 0.22) * 0.09, rS * eiSP.w * 0.5));
    float rTyre = smoothstep(0.62, 0.8, rTy.g) * (1.0 - smoothstep(aw0, aw0 + 9.0, rAl));
    rCol = mix(rCol, rGreenC * (1.0 - 0.25 * rWear), rGreen);
    float pat = vTrk.w; float useB = 0.0; float wl = 0.0; float P = 5.0; float q = 0.0;
    float rTop = pat > 2.5 ? aw0 + 3.2 : rOuter - 0.35;
    if (pat > 2.5) { useB = 0.0; }
    else if (pat < 0.5) { useB = smoothstep(aw0 + 3.2 - rAA, aw0 + 3.2 + rAA, rAl); wl = 1.0 - smoothstep(0.09, 0.09 + rAA, abs(rAl - aw0 - 3.2)); }
    else { if (pat < 1.5) { P = 6.0; q = (rS * 0.7071 + rAl * 0.7071) / P; } else { P = 12.0; q = rS / P; }
      float qa = max(fwidth(q) * P, 0.002); float qf = fract(q * 2.0); float bd = min(qf, 1.0 - qf) * P * 0.5;
      useB = step(0.5, fract(q)); wl = 1.0 - smoothstep(0.08, 0.08 + qa, bd); }
    float rIn = smoothstep(aw0 - rAA, aw0 + rAA, rAl) * (1.0 - smoothstep(rTop - rAA, rTop + rAA, rAl));
    float rMask = rPon * rIn;
    float rEdgeW = (1.0 - smoothstep(0.08, 0.08 + rAA, abs(rAl - aw0 - 0.1))) + (1.0 - smoothstep(0.1, 0.1 + rAA, abs(rAl - rTop + 0.15)));
    float rEnd = 1.0 - smoothstep(0.06, 0.12, abs(vTrk.z - 0.5) * 2.0);
    wl = clamp(wl + rEdgeW + rEnd * step(aw0, rAl), 0.0, 1.0);
    vec3 rPaint = mix(vColA, vColB, useB) * (0.88 + 0.22 * rM1.g);
    rPaint = mix(rPaint, vec3(0.72, 0.72, 0.7), wl);
    rPaint = mix(rPaint, rBase * 1.05, clamp(rWear * 0.75, 0.0, 0.8));
    rCol = mix(rCol, rPaint, rMask * (rPon > 0.0 ? 1.0 : 0.0));
    rCol = mix(rCol, rCol * 0.45, rTyre * 0.55 * rPon);
    vec4 rSp = texture2D(eiAux, vec2(rLat * 0.55, rS * eiSP.y * 6.0));
    float rSpill = (1.0 - smoothstep(0.0, 1.6, rGS - rAl)) * step(rAl, rGS + 0.2) * step(0.3, rSp.b);
    rCol = mix(rCol, vec3(0.30, 0.27, 0.225) * eiGT * (0.8 + 0.4 * rSp.r), rSpill * 0.85);
    float rDust = smoothstep(rOuter - 1.6, rOuter, rAl) * (1.0 - rMask) * 0.35;
    rCol = mix(rCol, vec3(0.25, 0.21, 0.15), rDust);
    diffuseColor.rgb = rCol;
  `;
  const RUNOFF_ROUGH = `
    roughnessFactor = mix(roughnessFactor, 0.62, max(rMask, rGreen) * (1.0 - rWear * 0.5));
    float eiFlat = clamp(max(rMask, rGreen) * 0.6, 0.0, 1.0);
  `;
  // gravel trap: packed stones (two rotated samples of the stone map blended by a macro mask, so the 2.2 m tile never repeats visibly),
  // macro tone patches, raked waves in the first metres, a darker compacted band at the inner edge, tyre ruts with spoil ridges where
  // cars have run through, and a stony fade (tallest stones survive longest) into the grass at the outer edge and the trap ends
  const GRAVEL_FRAG = `
    float gAl = abs(vTrk.x), gS = vTrk.y; float gd0 = gAl - vTrk.z; float gA = vTrk2.x;
    vec2 gUv2 = mat2(0.8, 0.6, -0.6, 0.8) * vUv * 0.71 + vec2(0.31, 0.57);
    vec4 gM = texture2D(eiAux, vec2(vTrk.x * 0.023 + 0.11, gS * eiSP.x * 0.8));
    vec4 gM2 = texture2D(eiAux, vec2(vTrk.x * 0.011 + 0.63, gS * eiSP.x * 0.35));
    float gMix = smoothstep(0.4, 0.6, gM.r);
    vec3 gCol = mix(diffuseColor.rgb, mapTexelToLinear(texture2D(map, gUv2)).rgb * diffuse, gMix);
    float gH = mix(texture2D(roughnessMap, vUv).r, texture2D(roughnessMap, gUv2).r, gMix);
    float gMid = texture2D(eiAux, vec2(vTrk.x * 0.21 + 0.37, gS * eiSP.y * 3.0)).r;
    float gWarm = texture2D(eiAux, vec2(vTrk.x * 0.006 + 0.81, gS * eiSP.x * 0.2)).r;
    gCol *= (0.78 + 0.4 * gM2.r) * (0.85 + 0.3 * gMid) * 0.88;
    gCol *= mix(vec3(0.97, 0.99, 1.02), vec3(1.04, 1.0, 0.93), smoothstep(0.3, 0.75, gWarm));
    float gPx = fwidth(gd0);
    float gRz = smoothstep(0.7, 1.4, gd0) * (1.0 - smoothstep(4.5, 8.0, gd0)) * (1.0 - smoothstep(0.05, 0.14, gPx));
    float gPh = gd0 / 0.36 + 0.6 * sin(gS * 0.17 + gd0 * 0.35) + 0.35 * sin(gS * 0.047 + 1.7);
    float gRk = sin(gPh * 6.2832);
    float gHgt = 0.02 * gRk * gRz;
    gCol *= 1.0 + 0.15 * gRk * gRz;
    float gComp = 1.0 - smoothstep(0.3, 1.6, gd0 + 0.4 * (gMid - 0.5));
    gCol = mix(gCol, gCol * vec3(0.56, 0.55, 0.54), gComp * 0.9);
    float gRut = 0.0, gBerm = 0.0;
    for (int k = 0; k < 2; k++) {
      float seg = floor(gS / 46.0) - float(k);
      if (eiHash(vec2(seg, 11.3)) < 0.6) {
        float s0 = seg * 46.0 + eiHash(vec2(seg, 2.9)) * 20.0; float len = 16.0 + eiHash(vec2(seg, 6.1)) * 26.0;
        float slope = 0.1 + eiHash(vec2(seg, 8.7)) * 0.22; float c0 = 0.6 + eiHash(vec2(seg, 4.4)) * 1.6;
        float u = gS - s0; float al = smoothstep(0.0, 2.5, u) * (1.0 - smoothstep(len * 0.5, len, u));
        float d = gd0 - c0 - u * slope - u * u * 0.004;
        float t1 = exp(-pow((d - 0.8) / 0.2, 2.0)) + exp(-pow((d + 0.8) / 0.2, 2.0));
        float b1 = exp(-pow((abs(d - 0.8) - 0.34) / 0.13, 2.0)) + exp(-pow((abs(d + 0.8) - 0.34) / 0.13, 2.0));
        gRut = max(gRut, t1 * al); gBerm = max(gBerm, b1 * al);
      }
    }
    gRut = clamp(gRut, 0.0, 1.0); gBerm = clamp(gBerm, 0.0, 1.0);
    gHgt += -0.04 * gRut + 0.014 * gBerm;
    gCol = mix(gCol, gCol * vec3(0.5, 0.47, 0.44), gRut * 0.85);
    gCol *= 1.0 + 0.16 * gBerm;
    diffuseColor.rgb = gCol;
    if (gA < 0.999) { float gN = eiHash(floor(vec2(gAl, gS) * 16.0)); if (gH * 0.7 + gN * 0.3 < 1.0 - gA) discard; }
  `;
  const GRAVEL_ROUGH = 'roughnessFactor = clamp(roughnessFactor * (1.0 - 0.12 * gComp) + 0.06 * gRut, 0.45, 1.0);';
  const GRAVEL_NORMAL = `
    vec3 mapN = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
    vec3 gN2 = texture2D(normalMap, gUv2).xyz * 2.0 - 1.0; gN2.xy = vec2(0.8 * gN2.x + 0.6 * gN2.y, -0.6 * gN2.x + 0.8 * gN2.y);
    mapN = normalize(mix(mapN, gN2, gMix)); mapN.xy *= normalScale * (1.0 - 0.6 * gComp) * (1.0 - 0.5 * gRut);
    normal = perturbNormal2Arb(-vViewPosition, normal, mapN, faceDirection);
    { vec3 gE = -vViewPosition; vec3 gSx = dFdx(gE), gSy = dFdy(gE); vec3 gR1 = cross(gSy, normal), gR2 = cross(normal, gSx);
      float gDet = dot(gSx, gR1); vec3 gGr = sign(gDet) * (dFdx(gHgt) * gR1 + dFdy(gHgt) * gR2); normal = normalize(abs(gDet) * normal - gGr); }
  `;
  // grass verge: the albedo is the environment's own ground colour (painted field map x its grass detail multiplier, computed exactly as
  // the terrain shader does), so hue and saturation always match the terrain; near the track the verge adds its own blade detail
  // (luminance only), a worn band along the edge and its normal map, all fading out towards the outer edge where it meets the terrain
  const VERGE_FRAG = `
    float vLat = vTrk.x, vS = vTrk.y, vAl = abs(vLat);
    vec3 vTex = diffuseColor.rgb;
    vec4 vM = texture2D(eiAux, vec2(vLat * 0.013 + 0.2, vS * eiSP.x * 0.5));
    vec4 vM2 = texture2D(eiAux, vec2(vLat * 0.05 + 0.6, vS * eiSP.y));
    vec3 vFar;
    if (eiFieldOn > 0.5) {
      vec2 fuv = vec2((vWp.x + eiMapHalf) / (2.0 * eiMapHalf), 1.0 - (vWp.z + eiMapHalf) / (2.0 * eiMapHalf));
      vec3 vField = sRGBToLinear(texture2D(eiField, fuv)).rgb;
      vec2 wq = vWp.xz;
      vec3 d1 = texture2D(eiDetail, wq * 0.62).rgb;
      vec3 d2 = texture2D(eiDetail, vec2(wq.x * 0.6 - wq.y * 0.8, wq.x * 0.8 + wq.y * 0.6) * 0.15).rgb;
      vec3 d3 = texture2D(eiDetail, wq * 0.031 + 0.37).rgb;
      float mac = texture2D(eiDetail, wq * 0.0071).a * 0.65 + texture2D(eiDetail, vec2(-wq.y, wq.x) * 0.0023 + 0.5).a * 0.35;
      vFar = vField * (d1 * 0.5 + d2 * 0.3 + d3 * 0.2) * 2.0 * (0.78 + 0.44 * mac);
    } else vFar = (vLat < 0.0 ? vFarL : vFarR) * (0.93 + 0.12 * vM2.r);
    float vFs = vLat < 0.0 ? vTrk.z : vTrk.w;
    float vT = smoothstep(vFs, vFs + 26.0, vAl);
    float vLum = dot(vTex, vec3(0.2126, 0.7152, 0.0722)) / max(dot(eiGrassMean, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    vec3 vChroma = vTex / max(eiGrassMean, vec3(1e-3)); vChroma /= max(dot(vChroma, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
    vec3 vDet = vec3(mix(1.0, vLum, 0.55)) * mix(vec3(1.0), vChroma, 0.12);
    vec3 vCol = vFar * mix(vDet, vec3(1.0), vT);
    float vWorn = (1.0 - smoothstep(eiHW + 0.4, eiHW + 2.2, vAl)) * (0.55 + 0.6 * vM2.g);
    vCol = mix(vCol, vCol * vec3(0.86, 0.76, 0.6) + vec3(0.03, 0.022, 0.012), clamp(vWorn, 0.0, 1.0) * 0.8);
    diffuseColor.rgb = vCol;
    float eiFlat = vT;
  `;
  function shaderMat(params, key, uniforms, vary, fColor, fRough, fNormal, normalChunk) {
    const m = new THREE.MeshStandardMaterial(params);
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + vary.v).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vary.vm);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SH_COMMON + '\n' + vary.f)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + fColor)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + (fRough || ''))
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nvec3 eiGeoN = normal;')
        .replace('#include <normal_fragment_maps>', normalChunk || ('#include <normal_fragment_maps>\n' + (fNormal || FLATTEN)));
    };
    m.customProgramCacheKey = () => 'ei-track-' + key;
    return m;
  }

  // ---------------------------------------------------------------- canvas textures for kerbs and paint
  // painted run-off lettering for the straights: the partners' URLs in white on black (red channel = mask), tiled along the lap
  let brandStripTex = null;
  function brandStripTexture() {
    if (brandStripTex) return brandStripTex;
    const W = 1024, H = 128; const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    // the venue's partners + the two race partners' URLs (EI.Ads.paintMaskStrip), laid out in the band's 16 x 1.8 m frame (f1-BRAND)
    const VW = Math.round(H * 16 / 1.8); ctx.save(); ctx.scale(W / VW, 1); EI.Ads.paintMaskStrip(ctx, VW, H); ctx.restore();
    brandStripTex = canvasTex(c, true); return brandStripTex;
  }
  function canvasTex(c, wrap) { const t = new THREE.CanvasTexture(c); if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
  // kerb: x = across (0 at the track edge), y = along; one tile = one red + one white block with slanted (sawtooth) joints
  // style 'yas': Yas Marina's flat kerbs (F1 photos 2016-2025, #009 / #018 / #022 / #033): square-cut crimson / white blocks of equal
  // length, one tile = one red + one white block (4 m)
  function kerbTexture(style) {
    const W = 256, H = 512; const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    ctx.fillStyle = style === 'street' ? '#e4e0d8' : '#ece9e1'; ctx.fillRect(0, 0, W, H);
    if (style === 'yas') { ctx.fillStyle = '#bd1c26'; ctx.fillRect(0, 0, W, H / 2); ctx.fillStyle = 'rgba(70,10,12,0.28)'; ctx.fillRect(0, H / 2 - 3, W, 3); ctx.fillRect(0, H - 3, W, 3); }
    else if (style === 'monzastripe') {   // MONZA-UPGRADE: the 2024 chicane kerbs (F1 photos ferrari_chicane_striped_kerb, williams_striped_kerb_spray): bands ALONG the lap, a pale-blue line at the track edge, then white / green / white / red ... (x = across)
      const bands = ['#e8e6de', '#13885a', '#e8e6de', '#c4202a', '#e8e6de', '#13885a', '#e8e6de', '#c4202a', '#e8e6de']; const x0 = W * 0.07, bw = (W - x0) / bands.length;
      ctx.fillStyle = '#6fb0dc'; ctx.fillRect(0, 0, x0, H); bands.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(x0 + k * bw, 0, bw + 1, H); });
      ctx.fillStyle = 'rgba(40,40,40,0.18)'; for (let y = 0; y < H; y += H / 4) ctx.fillRect(0, y, W, 2);   // the joints between the 3 m precast kerb elements
    }
    else if (style === 'monza') {   // 2024-25 Monza kerbs: flat painted blocks RED - WHITE - GREEN - WHITE, one tile = four ~3 m blocks (refs kerb_tricolore_2025)
      const slant = H * 0.02, B = H / 4; const blk = (k, col) => { const y0 = k * B; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, y0 - slant); ctx.lineTo(W, y0 + slant); ctx.lineTo(W, y0 + B + slant); ctx.lineTo(0, y0 + B - slant); ctx.closePath(); ctx.fill(); };
      blk(-1, '#e6e4dc'); blk(0, '#c4202a'); blk(1, '#e6e4dc'); blk(2, '#13885a'); blk(3, '#e6e4dc'); blk(4, '#c4202a');
      ctx.fillStyle = 'rgba(150,205,225,0.55)'; ctx.fillRect(W * 0.965, 0, W * 0.035, H);   // the thin pale-blue outer line
    }
    else {
    const slant = style === 'street' ? 0 : H * (style === 'spa' || style === 'cota' ? 0.05 : 0.07); const joint = (y0) => [[0, y0 - slant], [W, y0 + slant]];
    ctx.fillStyle = style === 'street' ? '#b0242a' : style === 'spa' ? '#be1620' : style === 'cota' ? '#842127' : style === 'greenwhite' ? '#1d9670' : '#c8141e';   // 'greenwhite': Silverstone's green / white exit kerbs   // 'spa': deep red / white blocks on the raised bevelled kerb
    for (const off of [-H, 0, H]) { const a = joint(off), b = joint(off + H / 2); ctx.beginPath(); ctx.moveTo(a[0][0], a[0][1]); ctx.lineTo(a[1][0], a[1][1]); ctx.lineTo(b[1][0], b[1][1]); ctx.lineTo(b[0][0], b[0][1]); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = 'rgba(25,10,10,0.55)'; ctx.lineWidth = 3;
    for (const off of [-H, -H / 2, 0, H / 2, H]) { const a = joint(off); ctx.beginPath(); ctx.moveTo(a[0][0], a[0][1]); ctx.lineTo(a[1][0], a[1][1]); ctx.stroke(); }
    if (style === 'mexico') { ctx.fillStyle = '#2c5fb4'; ctx.fillRect(0, 0, W * 0.085, H); }   // Mexico City (F1 photos: mex_kerb_redwhiteblue_redbull, mex_grandstand_crowd_kerb_mclaren): a thin blue band on the track-side edge of the red / white kerb
    }
    const r = U.rng(8);
    // rubber smudges where tyres ride the kerb (inner half), grit and paint chips
    for (let i = 0; i < 260; i++) { const x = Math.pow(r(), 1.8) * W * 0.75, y = r() * H; ctx.fillStyle = 'rgba(20,20,22,' + (0.03 + r() * 0.08).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(x, y, 3 + r() * 10, 8 + r() * 30, 0, 0, 6.283); ctx.fill(); }
    for (let i = 0; i < 1600; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,' + (0.05 + r() * 0.15).toFixed(3) + ')' : 'rgba(255,255,255,' + (0.04 + r() * 0.1).toFixed(3) + ')'; ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
    const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(10,10,10,0.38)'); g.addColorStop(0.08, 'rgba(10,10,10,0.08)'); g.addColorStop(0.9, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,50,30,0.35)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    return U.srgb(canvasTex(c, true));
  }
  function pitTextTexture() { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 256, 256); ctx.fillStyle = '#efeee9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 96px Arial Black, Arial'; ctx.fillText('PIT', 128, 66, 240); ctx.fillText('80', 128, 194, 200); weather(ctx, 256, 256, 13, 2500); return canvasTex(c); }
  function solidTexture(col) { const c = document.createElement('canvas'); c.width = c.height = 4; const ctx = c.getContext('2d'); ctx.fillStyle = col; ctx.fillRect(0, 0, 4, 4); return canvasTex(c); }
  function weather(ctx, w, h, seed, n, x0, y0) { const r = U.rng(seed); x0 = x0 || 0; y0 = y0 || 0; ctx.globalCompositeOperation = 'destination-out'; for (let i = 0; i < n; i++) { ctx.fillStyle = 'rgba(0,0,0,' + (0.15 + r() * 0.55).toFixed(2) + ')'; ctx.fillRect(x0 + r() * (w - 3), y0 + r() * (h - 3), 1 + r() * 3, 1 + r() * 3); } ctx.globalCompositeOperation = 'source-over'; }
  // sub-rectangle of a canvas atlas (canvas pixels, y down) -> function mapping the sub-texture's own (u, v) (v up) to atlas uv; 2 px inset
  function atlasRect(W, H, x, y, w, h) { const p = 2; return (u, v) => [(x + p + u * (w - 2 * p)) / W, 1 - (y + p + (1 - v) * (h - 2 * p)) / H]; }
  // painted markings atlas (2048 x 1024, transparent ground): grid slots (5 x 5 cells: number ahead of the front line, bracket going back),
  // four rows of run-off paint logos (the race partners), the start / finish chequer band and a solid white cell for plain lines
  const GRID_SLOTS = 22;   // painted grid boxes: the full 2026 field
  function paintAtlas() {
    const W = 2048, H = 1024; const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, W, H);
    const cw = 204.8, ch = 256, sq = 0.8;   // 5 x 5 cells of 204.8 x 204.8, each painted as a 204.8 x 256 cell squashed by 0.8
    for (let p = 0; p < GRID_SLOTS; p++) {
      ctx.save(); ctx.translate((p % 5) * cw, Math.floor(p / 5) * ch * sq); ctx.scale(1, sq); const x0 = 0, y0 = 0; ctx.fillStyle = '#efeeea';
      const fy = y0 + ch * 0.306; ctx.fillRect(x0 + cw * 0.06, fy, cw * 0.88, 7); ctx.fillRect(x0 + cw * 0.06, fy, 6, 80); ctx.fillRect(x0 + cw * 0.94 - 6, fy, 6, 80);
      ctx.font = 'italic 900 64px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p + 1), x0 + cw / 2, y0 + ch * 0.16); ctx.restore();
    }
    weather(ctx, 1024, 1024, 77, 9000, 0, 0);
    for (let k = 0; k < 4; k++) EI.Ads.paintRunoff(ctx, k, 1024, k * 128, 1024, 128, '#f2f1ec');
    weather(ctx, 1024, 512, 91, 26000, 1024, 0);
    const q = 21; for (let i = 0; i < 48; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#e9e8e3' : '#151517'; ctx.fillRect(1032 + i * q, 560 + j * q, q, q); }
    ctx.fillStyle = '#ecebe6'; ctx.fillRect(1032, 680, 64, 64);
    // infield patch (Yas's hairpin pocket, u5): Lumi plum ground, cream rim, the reversed Lumi lock-up
    { const L = EI.Ads.LUMI; ctx.fillStyle = L.plum; ctx.fillRect(1104, 700, 940, 316); ctx.strokeStyle = L.bg; ctx.lineWidth = 10; ctx.strokeRect(1116, 712, 916, 292);
      EI.Ads.lockupCentered(ctx, 'lumi', 1574, 858, 180, 760, L.bg); weather(ctx, 940, 316, 23, 5000, 1104, 700); }
    const tex = U.srgb(canvasTex(c)); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return { tex, grid: atlasRect(W, H, 0, 0, 1024, 1024), logos: atlasRect(W, H, 1024, 0, 1024, 512), cheq: atlasRect(W, H, 1032, 560, 48 * q, 4 * q), white: atlasRect(W, H, 1032, 680, 64, 64), patch: atlasRect(W, H, 1104, 700, 940, 316) };
  }

  class Track {
    constructor(data) {
      this.data = data; this.name = data.name;
      this.halfWidth = data.width / 2; this.kerbWidth = 1.3; this.sf = data.startFinish;
      this.buildSamples();
      this.buildElevation();
      this.buildCoarseGrid();
      this.computeWalls();
      this.computeRacingLine();
      this.drs = data.drs.map(z => ({ name: z.name, detect: z.detect, start: z.start, end: z.end }));
      this.sectors = data.sectors && data.sectors.length === 2 ? data.sectors.slice() : [this.length / 3, 2 * this.length / 3];   // data.sectors: the real sector lines (Spa)
      this.group = new THREE.Group();
    }

    // ---------------------------------------------------------------- samples
    buildSamples() {
      const pts = this.data.center.map(p => new THREE.Vector3(p[0], 0, p[1]));
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
      curve.arcLengthDivisions = 40000;
      const len = curve.getLength(); const n = Math.round(len / STEP);
      const spaced = curve.getSpacedPoints(n);
      this.n = n; this.length = len; this.ds = len / n;
      this.x = new Float32Array(n); this.z = new Float32Array(n); this.s = new Float32Array(n);
      for (let i = 0; i < n; i++) { this.x[i] = spaced[i].x; this.z[i] = spaced[i].z; this.s[i] = i * this.ds; }
      this.x = this.smooth(this.x, 6); this.z = this.smooth(this.z, 6);
      this.tx = new Float32Array(n); this.tz = new Float32Array(n); this.nx = new Float32Array(n); this.nz = new Float32Array(n); this.k = new Float32Array(n); this.heading = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = (i + n - 1) % n, b = (i + 1) % n;
        let dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        this.tx[i] = dx; this.tz[i] = dz; this.nx[i] = dz; this.nz[i] = -dx; this.heading[i] = Math.atan2(dz, dx);
      }
      for (let i = 0; i < n; i++) { const b = (i + 1) % n; this.k[i] = -(this.tx[i] * this.tz[b] - this.tz[i] * this.tx[b]) / this.ds; }
      this.k = this.smooth(this.k, 3);
    }
    buildElevation() {
      const n = this.n, L = this.length;
      // closed 1D spline through the control points via catmull-rom on (s, y)
      const EV = this.data.elevation || ELEV, EL = this.data.elevation ? this.data.lapLength : 5878;
      const cps = EV.slice(0, -1).map(p => [p[0] * L / EL, p[1]]); cps.push([L, 0]);
      this.y = new Float32Array(n); this.grade = new Float32Array(n);
      const m = cps.length;
      for (let i = 0; i < n; i++) {
        const s = this.s[i];
        let j = 0; while (j < m - 1 && cps[j + 1][0] < s) j++;
        const p0 = cps[(j - 1 + m) % m], p1 = cps[j], p2 = cps[(j + 1) % m], p3 = cps[(j + 2) % m];
        const t = (s - p1[0]) / ((p2[0] - p1[0]) || 1);
        const cr = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
        this.y[i] = cr(p0[1], p1[1], p2[1], p3[1], U.clamp(t, 0, 1));
      }
      this.y = this.smooth(this.y, 12);
      for (let i = 0; i < n; i++) { const a = (i + n - 1) % n, b = (i + 1) % n; this.grade[i] = (this.y[b] - this.y[a]) / (2 * this.ds); }
    }
    elevAt(s) { const f = U.mod(s / this.ds, this.n); const i = Math.floor(f), t = f - i; return U.lerp(this.y[i], this.y[(i + 1) % this.n], t); }
    smooth(arr, radius) {
      const n = arr.length, out = new Float32Array(n); const w = []; let ws = 0;
      for (let j = -radius; j <= radius; j++) { const g = Math.exp(-(j * j) / (2 * (radius / 2 + 0.01) ** 2)); w.push(g); ws += g; }
      for (let i = 0; i < n; i++) { let v = 0; for (let j = -radius; j <= radius; j++) v += arr[(i + j + n) % n] * w[j + radius]; out[i] = v / ws; }
      return out;
    }
    // coarse grid of nearest sample indices for fast world->track lookups anywhere on the map
    buildCoarseGrid() {
      const cell = 40, half = 2400; this.gridCell = cell; this.gridHalf = half; const gn = Math.ceil(half * 2 / cell); this.gridN = gn;
      this.grid = new Int32Array(gn * gn);
      for (let gz = 0; gz < gn; gz++) for (let gx = 0; gx < gn; gx++) {
        const x = -half + (gx + 0.5) * cell, z = -half + (gz + 0.5) * cell; let best = 0, bd = Infinity;
        for (let i = 0; i < this.n; i += 4) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
        this.grid[gz * gn + gx] = best;
      }
    }
    nearestIndex(x, z, hint) {
      const n = this.n;
      if (hint == null || hint < 0) {
        const gx = U.clamp(Math.floor((x + this.gridHalf) / this.gridCell), 0, this.gridN - 1), gz = U.clamp(Math.floor((z + this.gridHalf) / this.gridCell), 0, this.gridN - 1);
        hint = this.grid[gz * this.gridN + gx];
        let best = hint, bd = Infinity;
        for (let j = -60; j <= 60; j += 2) { const i = (hint + j + n) % n; const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
        hint = best;
      }
      let best = hint, bd = (this.x[hint] - x) ** 2 + (this.z[hint] - z) ** 2;
      for (let j = -30; j <= 30; j++) { const i = (hint + j + n) % n; const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
      return best;
    }
    project(x, z, hint, out) {
      const i = this.nearestIndex(x, z, hint); const dx = x - this.x[i], dz = z - this.z[i];
      out = out || {}; out.i = i; out.along = dx * this.tx[i] + dz * this.tz[i]; out.lat = dx * this.nx[i] + dz * this.nz[i];
      out.s = U.mod(this.s[i] + out.along, this.length); out.dist = Math.abs(out.lat); return out;
    }
    idxAtS(s) { return U.mod(Math.round(s / this.ds), this.n); }
    // which side of the lap the pit lane runs on (-1: negative lateral offsets, the "L" arrays; +1: "R")
    pitSideSign() {
      if (this._pitSide) return this._pitSide; const p = this.data.pit; if (!p || p.length < 3) return (this._pitSide = -1);
      const m = p[Math.floor(p.length / 2)]; const pr = this.project(m[0], m[1], null, {}); return (this._pitSide = pr.lat < 0 ? -1 : 1);
    }
    // Yas's hairpin pocket (data.infield): the outline of the ground behind the inside barrier between `paint` [s0, s1], following this
    // track's own inner wall line (so the paint always meets the barrier) and closed straight across the open end
    infieldPocket() {
      if (this._pocket !== undefined) return this._pocket; const F = this.data.infield; if (!F) return (this._pocket = null);
      const [s0, s1] = F.paint; const sd = this.kFold[this.idxAtS((s0 + s1) / 2)] > 0 ? 1 : -1; const wall = sd > 0 ? this.wallR : this.wallL;
      const at = (s, off) => { const i = this.idxAtS(U.mod(s, this.length)); const l = wall[i] + off; return [this.x[i] + this.nx[i] * sd * l, this.z[i] + this.nz[i] * sd * l]; };
      const poly = []; for (let s = s0; s <= s1; s += 4) poly.push(at(s, 0.2));
      return (this._pocket = { sd, at, poly });
    }
    cornerNameAt(s) { let name = ''; for (const c of this.data.corners) if (s >= c.s - 40) name = c.name; return name || this.data.corners[this.data.corners.length - 1].name; }
    sectorAt(s) { return s < this.sectors[0] ? 0 : s < this.sectors[1] ? 1 : 2; }
    gridSlot(pos) {
      const s = this.sf - 10 - pos * 8; const i = this.idxAtS(s); const side = (pos % 2 === 0 ? -1 : 1) * 2.6 * (this.data.gridPole === 'left' ? -1 : 1);   // data.gridPole 'left': pole on the +lat (driver's left) side
      return { x: this.x[i] + this.nx[i] * side, z: this.z[i] + this.nz[i] * side, y: this.y[i], heading: this.heading[i], i };
    }

    // data.corners entry a lap position belongs to (the last one starting within 60 m ahead of s) and list matching: the data lists
    // (tyreCorners, tecProCorners, sausageCorners, brakeStops, runoffSchemes, logoSpots) take corner NAMES and / or TURN NUMBERS (corners[].t),
    // so a circuit whose HUD name covers several turns (COTA: "The Esses" T3-T6) can still dress one turn (COTA-DRESS)
    cornerObj(s) { let k = null; for (const c of this.data.corners) if (s >= c.s - 60) k = c; return k; }
    cornerIn(list, c) { return !!c && (list.indexOf(c.name) >= 0 || (c.t != null && list.indexOf(c.t) >= 0)); }
    // side arrays (wallL/R, runoffL/R, gravelL/R) follow the drawing convention used by every ribbon: "L" = side -1 = negative lateral
    // offset (project().lat < 0), "R" = side +1. k > 0 bends towards +lat, so the run-off / far barrier of such a corner is on L.
    computeWalls() {
      const n = this.n, hw = this.halfWidth; const kw = this.smooth(this.k, 25);
      this.wallL = new Float32Array(n); this.wallR = new Float32Array(n); this.gravelL = new Uint8Array(n); this.gravelR = new Uint8Array(n); this.runoffL = new Uint8Array(n); this.runoffR = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const c = kw[i]; const outside = Math.min(1, Math.abs(c) * 110); let l = hw + 12, r = hw + 12;
        // k > 0 turns towards +lateral (the inside is +lat): the outside, drawn at negative offsets, is "L"
        if (c > 0) { l += 40 * outside; r -= 5 * outside; } else { r += 40 * outside; l -= 5 * outside; }
        this.wallL[i] = l; this.wallR[i] = r;
      }
      this.wallL = this.smooth(this.wallL, 30); this.wallR = this.smooth(this.wallR, 30);
      // the map's grandstands stand behind the barrier: without measured barriers (data.wallProfile / data.walls) the generic run-off
      // (up to ~52 m on the outside of a corner) enclosed whole stands (Abbey, Village, Luffield, Jim Clark, Copse at Silverstone). The
      // barrier is pulled in to 4 m in front of any stand, easing in and out at 0.5 m per metre of lap (FIT-AUDIT)
      if (!(this.data.wallProfile && this.data.wallProfile.length > 2) && !this.data.walls) {
        const pr = {}; const caps = [new Float32Array(n).fill(1e9), new Float32Array(n).fill(1e9)];
        for (const gs of (this.data.scenery && this.data.scenery.grandstands) || []) { const p = gs.p; if (!p || p.length < 3) continue;
          for (let k = 0; k < p.length; k++) { const a = p[k], b = p[(k + 1) % p.length]; const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
            for (let j = 0; j < m; j++) { this.project(a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m, null, pr); if (pr.dist < hw + 8) continue; const c = caps[pr.lat < 0 ? 0 : 1]; c[pr.i] = Math.min(c[pr.i], pr.dist - 4); } } }
        [[caps[0], this.wallL], [caps[1], this.wallR]].forEach(([cap, wall]) => { for (let i = 0; i < n; i++) { if (cap[i] > 1e8) continue; for (let j = -60; j <= 60; j++) { const k = (i + j + n) % n; wall[k] = Math.min(wall[k], Math.max(hw + 3, cap[i] + Math.abs(j) * this.ds * 0.5)); } } });
      }
      // measured barrier positions (data.wallProfile = [[s, L, R], ...], metres from the centre line, from aerial imagery) replace the generic model
      const WP = this.data.wallProfile;
      if (WP && WP.length > 2) {
        const L = this.length, sc = L / this.data.lapLength; let j = 0;
        for (let i = 0; i < n; i++) {
          const s = this.s[i]; while (j < WP.length - 1 && WP[j + 1][0] * sc <= s) j++;
          const a = WP[j], b = WP[(j + 1) % WP.length], sa = a[0] * sc, sb = j + 1 < WP.length ? b[0] * sc : L + b[0] * sc;
          const f = s < sa ? 0 : U.clamp((s - sa) / ((sb - sa) || 1), 0, 1);
          this.wallL[i] = Math.max(hw + 2, U.lerp(a[1], b[1], f)); this.wallR[i] = Math.max(hw + 2, U.lerp(a[2], b[2], f));
        }
        this.wallL = this.smooth(this.wallL, 6); this.wallR = this.smooth(this.wallR, 6);
      }
      // street circuits: barriers a fixed distance off the kerbs everywhere, run-off only where the data lists it ([s0, s1, 'out' | 'in', width])
      const WD = this.data.walls;
      if (WD) {
        for (let i = 0; i < n; i++) { this.wallL[i] = hw + WD.base; this.wallR[i] = hw + WD.base; }
        for (const [s0, s1, which, w] of WD.runoff || []) for (let i = 0; i < n; i++) {
          const s = this.s[i]; if (s < s0 - 25 || s > s1 + 25) continue; const f = U.smoothstep(s0 - 25, s0, s) * (1 - U.smoothstep(s1, s1 + 25, s));
          const outsideL = kw[i] > 0; const onL = which === 'out' ? outsideL : !outsideL; const v = hw + WD.base + (w - WD.base) * f;
          if (onL) this.wallL[i] = Math.max(this.wallL[i], v); else this.wallR[i] = Math.max(this.wallR[i], v);
        }
        this.wallL = this.smooth(this.wallL, 4); this.wallR = this.smooth(this.wallR, 4);
      }
      // painted straights with the barriers close to the track (Yas Marina's pit straight: walls a few metres off the edge
      // lines, as in the photos); eased in and out over 40 m
      for (const P of this.data.straightPaint || []) if (P.wall) {
        const L = this.length, span = U.mod(P.s1 - P.s0, L);
        for (let i = 0; i < n; i++) {
          const u = U.mod(this.s[i] - P.s0, L); const out = u <= span ? 0 : Math.min(u - span, L - u); const f = 1 - U.smoothstep(0, 40, out);
          if (f <= 0) continue; const tgt = hw + P.wall;
          this.wallL[i] = U.lerp(this.wallL[i], Math.min(this.wallL[i], tgt), f); this.wallR[i] = U.lerp(this.wallR[i], Math.min(this.wallR[i], tgt), f);
        }
      }
      // inside of a corner: offsets beyond the local radius would fold the normals over each other
      this.kFold = this.smooth(this.k, 4);
      for (let i = 0; i < n; i++) { const R = 1 / (Math.abs(this.kFold[i]) + 1e-6); const cap = Math.max(hw + 3, R * 0.85); if (this.kFold[i] > 0) this.wallR[i] = Math.min(this.wallR[i], cap); else this.wallL[i] = Math.min(this.wallL[i], cap); }
      this.wallL = this.smooth(this.wallL, 6); this.wallR = this.smooth(this.wallR, 6);
      const kk = this.smooth(this.k, 8);
      const gravelCorners = this.data.gravelCorners || ['Copse', 'Becketts', 'Stowe', 'Club', 'Luffield', 'Abbey', 'Brooklands', 'Vale', 'Village', 'Maggotts'];
      const cornerAt = (s) => { let name = null; for (const c of this.data.corners) if (s >= c.s - 60) name = c.name; return name; };
      if (WD) {
        // tarmac to the barrier everywhere (no grass verge inside the walls); the listed run-offs are plain tarmac
        for (let i = 0; i < n; i++) { this.runoffL[i] = 1; this.runoffR[i] = 1; }
      } else for (let i = 0; i < n; i++) {
        const c = kk[i]; if (Math.abs(c) < 1 / 500) continue; const name = cornerAt(this.s[i]);
        const gravel = gravelCorners.indexOf(name) >= 0 && Math.abs(c) > 1 / 220;
        if (c > 0) { this.runoffL[i] = 1; if (gravel) this.gravelL[i] = 1; } else { this.runoffR[i] = 1; if (gravel) this.gravelR[i] = 1; }
      }
      // mapped gravel beds (data.runoff = [[s0, s1, side (-1 = L / lat < 0, +1 = R), 'gravel'], ...], Spa from OSM) replace the named-corner
      // gravel: a tarmac band past the kerb, then gravel, on the listed stretches only
      if (this.data.runoff && !WD) {
        this.gravelL.fill(0); this.gravelR.fill(0);
        for (const [s0, s1, sd, kind] of this.data.runoff) { if (kind !== 'gravel') continue; for (let s = s0; s <= s1; s += this.ds) { const i = this.idxAtS(s); if (sd < 0) { this.runoffL[i] = 1; this.gravelL[i] = 1; } else { this.runoffR[i] = 1; this.gravelR[i] = 1; } } }
      }
    }
    computeRacingLine() {
      const n = this.n, hw = this.halfWidth; const kt = this.smooth(this.k, 10), kw = this.smooth(this.k, 55); const kref = 1 / 70, maxOff = hw * 0.62;
      const off = new Float32Array(n);
      for (let i = 0; i < n; i++) off[i] = U.clamp(maxOff * (1.7 * kt[i] / kref - 1.25 * kw[i] / kref), -maxOff, maxOff);
      this.lineOff = this.smooth(off, 18);
      this.lineX = new Float32Array(n); this.lineZ = new Float32Array(n); this.lineK = new Float32Array(n);
      for (let i = 0; i < n; i++) { this.lineX[i] = this.x[i] + this.nx[i] * this.lineOff[i]; this.lineZ[i] = this.z[i] + this.nz[i] * this.lineOff[i]; }
      for (let i = 0; i < n; i++) {
        const a = (i + n - 1) % n, b = (i + 1) % n; const ax = this.lineX[b] - this.lineX[i], az = this.lineZ[b] - this.lineZ[i], bx = this.lineX[i] - this.lineX[a], bz = this.lineZ[i] - this.lineZ[a];
        const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; this.lineK[i] = -((bx / lb) * (az / la) - (bz / lb) * (ax / la)) / ((la + lb) / 2);
      }
      this.lineK = this.smooth(this.lineK, 6);
    }

    // ---------------------------------------------------------------- ribbon helper (y follows track elevation)
    ribbon(offsetA, offsetB, opts) {
      const n = this.n, pos = [], uv = [], col = [], idx = []; const color = new THREE.Color(opts.color || 0xffffff);
      let vi = 0; const map = new Int32Array(n + 1); const y = opts.y || 0;
      const inMask = (ii) => !opts.mask || opts.mask(ii) || opts.mask((ii + n - 1) % n);
      let flip = null;
      for (let i = 0; i <= n; i++) {
        const ii = i % n;
        if (!inMask(ii)) { map[i] = -1; continue; }
        let a = offsetA(ii), b = offsetB(ii);
        if (this.kFold) { const kf = this.kFold[ii]; const cap = Math.max(2, 0.9 / (Math.abs(kf) + 1e-6)); if (kf > 0) { a = Math.min(a, cap); b = Math.min(b, cap); } else { a = Math.max(a, -cap); b = Math.max(b, -cap); } }
        // ground ribbons built from the outside in (negative side) would face down and be culled: keep them facing up
        if (flip === null && Math.abs(b - a) > 1e-4) flip = b < a;
        const ya = this.y[ii] + (opts.ya ? opts.ya(ii) : y), yb = this.y[ii] + (opts.yb ? opts.yb(ii) : y);
        pos.push(this.x[ii] + this.nx[ii] * a, ya, this.z[ii] + this.nz[ii] * a, this.x[ii] + this.nx[ii] * b, yb, this.z[ii] + this.nz[ii] * b);
        const v = opts.vFn ? opts.vFn(i) : (i * this.ds) / (opts.vScale || 8); uv.push(0, v, 1, v);
        const ca = opts.colorFn ? opts.colorFn(ii, 0) : color, cb = opts.colorFn ? opts.colorFn(ii, 1) : color; col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
        map[i] = vi; vi += 2;
      }
      for (let i = 0; i < n; i++) { const a = map[i], b = map[i + 1]; if (a < 0 || b < 0 || (opts.mask && !opts.mask(i))) continue; if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      // ground ribbons (no vertical profile) get a plain up normal: sliver triangles where the inside edge converges would otherwise shade dark
      if (!opts.ya && !opts.yb) { const nr = geo.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0); }
      return geo;
    }
    // multi-column strip along the lap with per-vertex attributes.
    // o.lat(ii, c) lateral offset of column c; o.y(ii, c) height above the track; o.uv(ii, c, lat, i) -> [u, v]; o.attrs { name: [size, fn(ii, c, lat, i)] }
    // o.mask(ii) draws the quad ii -> ii+1; o.normals: 'up' (default) or 'compute'
    strip(K, o) {
      const n = this.n, pos = [], uv = [], idx = [], at = {}; const attrs = o.attrs || {}; const lats = new Float32Array(K);
      for (const k in attrs) at[k] = [];
      const inMask = (ii) => !o.mask || o.mask(ii) || o.mask((ii + n - 1) % n);
      let prev = -1, vi = 0, flip = null;
      for (let i = 0; i <= n; i++) {
        const ii = i % n;
        if (!inMask(ii)) { prev = -1; continue; }
        const kf = this.kFold[ii], cap = Math.max(2, 0.9 / (Math.abs(kf) + 1e-6));
        for (let c = 0; c < K; c++) { let l = o.lat(ii, c, i); if (kf > 0) l = Math.min(l, cap); else l = Math.max(l, -cap); lats[c] = l; }
        if (flip === null && Math.abs(lats[K - 1] - lats[0]) > 1e-4) flip = lats[K - 1] < lats[0];
        for (let c = 0; c < K; c++) {
          const l = lats[c]; pos.push(this.x[ii] + this.nx[ii] * l, this.y[ii] + (o.y ? o.y(ii, c, l) : 0), this.z[ii] + this.nz[ii] * l);
          const t = o.uv ? o.uv(ii, c, l, i) : [c / (K - 1), i * this.ds / 8]; uv.push(t[0], t[1]);
          for (const k in attrs) { const v = attrs[k][1](ii, c, l, i); if (attrs[k][0] === 1) at[k].push(v); else for (let q = 0; q < attrs[k][0]; q++) at[k].push(v[q]); }
        }
        if (prev >= 0 && (!o.mask || o.mask((ii + n - 1) % n))) for (let c = 0; c < K - 1; c++) { const a = prev + c, b = vi + c; if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1); }
        prev = vi; vi += K;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      for (const k in attrs) geo.setAttribute(k, new THREE.Float32BufferAttribute(at[k], attrs[k][0]));
      geo.setIndex(idx);
      if (o.normals === 'compute') geo.computeVertexNormals(); else { const nr = new Float32Array(pos.length); for (let i = 1; i < nr.length; i += 3) nr[i] = 1; geo.setAttribute('normal', new THREE.BufferAttribute(nr, 3)); }
      return geo;
    }
    // interpolated frame at arc length s
    frameAt(s) {
      const f = U.mod(s / this.ds, this.n); const i = Math.floor(f), j = (i + 1) % this.n, u = f - i;
      const nx = U.lerp(this.nx[i], this.nx[j], u), nz = U.lerp(this.nz[i], this.nz[j], u), l = Math.hypot(nx, nz) || 1;
      return { x: U.lerp(this.x[i], this.x[j], u), y: U.lerp(this.y[i], this.y[j], u), z: U.lerp(this.z[i], this.z[j], u), nx: nx / l, nz: nz / l, tx: -nz / l, tz: nx / l, i };
    }
    // flat painted decal following the track between s0..s1 and lateral latA..latB; uvFn(fs, fl) -> [u, v] with fs/fl in 0..1 along / across
    addDecal(b, s0, s1, latA, latB, uvFn, segs, yOff) {
      if (latB < latA) { const t = latA; latA = latB; latB = t; const f = uvFn; uvFn = (fs, fl) => f(fs, 1 - fl); }
      segs = segs || Math.max(1, Math.ceil((s1 - s0) / 1.5)); const base = b.pos.length / 3;
      for (let r = 0; r <= segs; r++) {
        const fs = r / segs, f = this.frameAt(s0 + (s1 - s0) * fs);
        for (let c = 0; c < 2; c++) { const l = c ? latB : latA; b.pos.push(f.x + f.nx * l, f.y + (yOff || 0.012), f.z + f.nz * l); const t = uvFn(fs, c); b.uv.push(t[0], t[1]); }
        if (r > 0) { const a = base + (r - 1) * 2, q = base + r * 2; b.idx.push(a, q, a + 1, a + 1, q, q + 1); }
      }
    }
    static batchMesh(b, mat) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      const nr = new Float32Array(b.pos.length); for (let i = 1; i < nr.length; i += 3) nr[i] = 1; geo.setAttribute('normal', new THREE.BufferAttribute(nr, 3)); geo.setIndex(b.idx);
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; return m;
    }

    // ---------------------------------------------------------------- build
    build(scenery) {
      const g = this.group; this.scenery = scenery;
      this.buildSurfaces(g); this.buildBarriers(g); this.buildPitLane(g); this.buildFurniture(g);
      this.mergeStatic(g);
      // street circuits: every street-level batch (scenery + barriers) is cut into cells and drawn through the shared atlas material
      if (this.data.street && scenery && scenery.sworld) { scenery.sworld.build(); this.streetStats = Object.assign(this.streetStats || {}, { world: scenery.sworld.stats }); }
      return g;
    }

    // where the rubber goes down: braking zones (speed profile when available), traction zones and signed cornering along the lap
    computeWear() {
      const n = this.n, ds = this.ds; const brake = new Float32Array(n), exit = new Float32Array(n); let v = null;
      try { if (EI.buildSpeedProfile && EI.CAR) v = EI.buildSpeedProfile(this); } catch (e) { v = null; }
      if (v) {
        for (let i = 0; i < n; i++) { const j = (i + 3) % n; const a = (v[i] * v[i] - v[j] * v[j]) / (2 * 3 * ds); brake[i] = U.smoothstep(5, 28, a); exit[i] = U.smoothstep(2.5, 9, -a) * (1 - U.smoothstep(45, 65, v[i])); }
      } else {
        const ak = this.k.map(Math.abs);
        for (let i = 0; i < n; i++) { let ahead = 0; for (let j = 4; j < 60; j += 2) ahead = Math.max(ahead, ak[(i + j) % n]); let behind = 0; for (let j = 2; j < 30; j += 2) behind = Math.max(behind, ak[(i - j + n) % n]);
          brake[i] = U.clamp((ahead - ak[i]) * 90, 0, 1) * (ak[i] < 0.006 ? 1 : 0.3); exit[i] = U.clamp((behind - ak[i]) * 70, 0, 1); }
      }
      this.wearBrake = this.smooth(brake, 6); this.wearExit = this.smooth(exit, 8);
      const lk = this.smooth(this.lineK, 8); this.wearCorner = new Float32Array(n);
      for (let i = 0; i < n; i++) this.wearCorner[i] = U.clamp(lk[i] * 55, -1, 1);
    }
    // one shared set of procedural textures for every track surface
    surfaceTextures() {
      if (Track._tex) return Track._tex;
      const T = {};
      T.asphalt = U.asphaltMaps(1024, { seed: 17, base: [74, 73, 70], density: 0.08, bump: 1.7, contrast: 0.6 });
      T.runoff = U.asphaltMaps(512, { seed: 29, base: [84, 84, 81], density: 0.06, bump: 1.6, cracks: 3, contrast: 0.6 });
      T.aux = U.trackAuxTexture(1024, 5);
      T.grass = U.grassMaps(512, { seed: 23, base: [50, 80, 34] });
      T.gravel = U.gravelBedMaps(1024, { seed: 41 });
      { const d = T.grass.map.image.data; const m = [0, 0, 0]; const N = d.length / 4; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) m[c] += Math.pow(d[i + c] / 255, 2.2); T.grassMean = new THREE.Vector3(m[0] / N, m[1] / N, m[2] / N); }
      Track._tex = T; return T;
    }

    buildSurfaces(g) {
      const hw = this.halfWidth, kw = this.kerbWidth, n = this.n, L = this.length, ds = this.ds, self = this;
      this.computeWear();
      const T = this.surfaceTextures();
      const per = (p) => L / Math.max(1, Math.round(L / p));                  // tile periods that divide the lap: no seam at s = 0
      const sp = new THREE.Vector4(1 / per(48), 1 / per(14), 1 / per(26), 1 / per(64));
      // gravel tone (linear multiplier, data.gravelTint): the trap's material colour and the spill / dust it throws onto the run-off
      const GT = new THREE.Vector3().fromArray(this.data.gravelTint || [1, 1, 1]);
      const common = { eiAux: { value: T.aux }, eiSP: { value: sp }, eiHW: { value: hw }, eiKW: { value: kw }, eiGT: { value: GT } };
      // no kerbs inside a tunnel (Monaco's sweeps through it on plain white edge lines)
      const TN = this.data.tunnel; const kk = this.smooth(this.k, 6); const kerbMask = i => Math.abs(kk[i]) > 1 / 420 && !(TN && this.s[i] > TN.s0 + 10 && this.s[i] < TN.s1 - 10);
      this.kerbMask = kerbMask;

      // ------------------------------------------------ asphalt (single strip; all detail is per-pixel from lateral offset / lap distance)
      const tA = per(5);
      const aGeo = this.strip(4, {
        lat: (ii, c) => -hw + c * (2 * hw / 3), uv: (ii, c, l, i) => [l / 5, i * ds / tA],
        attrs: {
          trk: [4, (ii, c, l, i) => [l, i * ds, this.lineOff[ii], this.wearBrake[ii]]],
          trk2: [4, (ii) => [this.wearCorner[ii], this.wearExit[ii], U.clamp(0.3 + 0.7 * Math.max(this.wearExit[ii], Math.abs(this.wearCorner[ii]) * 0.6), 0, 1), 0]],
        },
      });
      const street = !!this.data.street; const SDEF = street ? '#define EI_STREET\n' : '';
      const shd = street ? this.streetShade() : null; const aU = shd ? Object.assign({}, common, { eiShd: { value: shd }, eiShdK: { value: 1 }, eiShdL: { value: 1 / L } }) : common;
      const aV = street ? Object.assign({}, VARY4, { f: VARY4.f + ' uniform sampler2D eiShd; uniform float eiShdK; uniform float eiShdL;' }) : VARY4;
      if (street && !shd) { aU.eiShd = { value: Track._white || (Track._white = (() => { const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); t.needsUpdate = true; return t; })()) }; aU.eiShdK = { value: 0 }; aU.eiShdL = { value: 1 / L }; }
      const aMat = shaderMat({ map: T.asphalt.map, normalMap: T.asphalt.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: T.asphalt.roughnessMap, roughness: 1, metalness: 0 }, street ? 'asphalt-street' : 'asphalt', aU, aV, SDEF + ASPHALT_FRAG, ASPHALT_ROUGH, FLATTEN);
      if (street) this._shdU = aU;
      const aMesh = new THREE.Mesh(aGeo, aMat); aMesh.receiveShadow = true; aMesh.name = 'asphalt'; g.add(aMesh);

      // ------------------------------------------------ kerbs: bevelled profile (rise, top, fall), sawtooth red/white tiled by arc length
      const KS = this.data.kerbStyle; const kerbTex = kerbTexture(this.data.street ? 'street' : KS); const kerbTile = KS === 'yas' ? 4.0 : KS === 'monza' ? 12 : KS === 'spa' || KS === 'cota' ? 3.0 : 2.4;
      const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, vertexColors: true, roughness: 0.48, metalness: 0, normalMap: T.runoff.normalMap, normalScale: new THREE.Vector2(0.25, 0.25) });
      const ramp = new Float32Array(n); { const a = new Float32Array(n), b = new Float32Array(n);
        for (let k = 0; k < 2 * n; k++) { const i = k % n, p = (i + n - 1) % n; a[i] = kerbMask(p) ? a[p] + 1 : 0; }
        for (let k = 2 * n; k >= 0; k--) { const i = k % n, q = (i + 1) % n; b[i] = kerbMask(i) ? b[q] + 1 : 0; }
        for (let i = 0; i < n; i++) ramp[i] = U.clamp(Math.min(a[i], b[i]) * ds / 3.0, 0, 1); }
      const prof = this.data.street || KS === 'yas' || KS === 'monza' ? [[0, 0.004], [0.1, 0.026], [kw - 0.1, 0.03], [kw, 0.006]] : KS === 'cota' ? [[0, 0.004], [0.22, 0.05], [kw - 0.26, 0.056], [kw, 0.0]] : [[0, 0.004], [0.3, 0.068], [kw - 0.32, 0.074], [kw, 0.0]];   // 'cota': the low painted-block kerb (flatter than Silverstone's)
      const kerbTone = new Float32Array(n); for (let i = 0; i < n; i++) kerbTone[i] = 0.82 + 0.18 * U.noise2(i * 0.11, 4.2);
      // data.kerbAlt [[s0, s1, 'ry'], ...] (Spa: the Raidillon crest, Blanchimont): red / yellow kerbs = the red / white tile tinted per vertex (white -> yellow, red stays red)
      const kerbAlt = new Uint8Array(n); for (const [a0, a1] of this.data.kerbAlt || []) for (let s = a0; s <= a1; s += this.ds) kerbAlt[this.idxAtS(s)] = 1;
      const altCol = [1.0, 0.8, 0.1];
      // data.kerbGW [[s0, s1], ...] (Silverstone: the green / white kerbs at a few exits, F1 photos ref_019 / 033): those stretches are drawn
      // from a green / white tile in one extra merged mesh (same material type, no new shader); the red / white meshes skip them
      const kerbGW = new Uint8Array(n); for (const [a0, a1] of this.data.kerbGW || []) for (let s = a0; s <= a1; s += this.ds) kerbGW[this.idxAtS(U.mod(s, this.length))] = 1;
      const hasGW = kerbGW.some(v => v), gwGeos = [];
      for (const side of [-1, 1]) {
        // stripes advance with the arc length at the kerb's middle so they never stretch on the outside of a corner
        const arc = new Float32Array(n + 1); let acc = 0;
        for (let i = 1; i <= n; i++) { const a = (i - 1) % n, b = i % n; const m = side * (hw + kw / 2); const d = Math.hypot(this.x[b] + this.nx[b] * m - this.x[a] - this.nx[a] * m, this.z[b] + this.nz[b] * m - this.z[a] - this.nz[a] * m); acc = kerbMask(a) ? acc + d : 0; arc[b] = acc; if (i === n) arc[n] = acc; }
        for (let pIdx = 0; pIdx < 3; pIdx++) for (const gwPass of hasGW ? [0, 1] : [0]) {
          const p0 = prof[pIdx], p1 = prof[pIdx + 1];
          const geo = this.strip(2, {
            mask: !hasGW ? kerbMask : gwPass ? (i => kerbMask(i) && kerbGW[i] === 1) : (i => kerbMask(i) && kerbGW[i] === 0), normals: 'compute',
            lat: (ii, c) => side * (hw + (c ? p1[0] : p0[0])),
            y: (ii, c) => (c ? p1[1] : p0[1]) * (0.15 + 0.85 * ramp[ii]),
            uv: (ii, c, l, i) => [(c ? p1[0] : p0[0]) / kw, (i === n ? arc[n] : arc[ii]) / kerbTile],
            attrs: { color: [3, (ii, c) => { const t = kerbTone[ii] * (c === 0 && pIdx === 0 ? 0.9 : 1); return kerbAlt[ii] ? [t * altCol[0], t * altCol[1], t * altCol[2]] : [t, t, t]; }] },
          });
          if (gwPass) { gwGeos.push(geo); continue; }
          const m = new THREE.Mesh(geo, kerbMat); m.receiveShadow = true; m.castShadow = pIdx === 1; m.name = 'kerb'; g.add(m);
        }
      }
      if (gwGeos.length) {
        const gwMat = kerbMat.clone(); gwMat.map = kerbTexture(KS === 'monza' ? 'monzastripe' : 'greenwhite');   // (Monza: the striped chicane kerbs on the kerbGW stretches)
        const gm = new THREE.Mesh(U.mergeGeometries(gwGeos.map(geo => ({ geo, matrix: new THREE.Matrix4() }))), gwMat); gm.receiveShadow = true; gm.name = 'kerb'; g.add(gm);
      }
      this.buildSausages(g);

      // ------------------------------------------------ run-off: shoulder everywhere, green strip behind kerbs, painted asphalt at the big corners, gravel beyond
      const cornerAt = (s) => { let name = null; for (const c of this.data.corners) if (s >= c.s - 60) name = c.name; return name; };
      const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
      const BLUE = lin(0x2457a6), GREEN = lin(0x2f8a3c), DBLUE = lin(0x1b3f86);
      // Silverstone (aerials, becketts_motogp): dark tarmac aprons behind the green strip, a single blue band at the newer corners
      // (pattern 3), plain tarmac at Copse / Maggotts / Becketts / Stowe; corners not listed get no paint
      const SCHEMES = {
        Abbey: [3, DBLUE, DBLUE], Village: [3, DBLUE, DBLUE], 'The Loop': [3, DBLUE, DBLUE], Brooklands: [3, BLUE, BLUE], Luffield: [3, BLUE, BLUE],
        Woodcote: [3, GREEN, GREEN], Vale: [3, BLUE, BLUE], Club: [3, BLUE, BLUE],
      };
      // street circuit: the escape road at the Nouvelle Chicane is painted solid red with white borders, Sainte Devote's in blue / red bands
      // (brick red, worn: chicane1 / rascasse refs, never the saturated pink-red)
      const WHITE_ = lin(0xe2ded6), BRICK = lin(0xa52a2a);
      if (this.data.street) Object.assign(SCHEMES, { 'Nouvelle Chicane': [0, BRICK, BRICK], 'Sainte Dévote': [2, BLUE, WHITE_], 'La Rascasse': [2, BRICK, WHITE_] });
      // circuits with a house colour for the run-off (Yas Marina's turquoise): the strip behind the kerbs in that colour, and every
      // corner's painted run-off in bands of it and a deeper shade
      const RC = this.data.runoffColors;
      if (RC) { const A = lin(RC[0]), B = lin(RC[1]); for (const c of this.data.corners) if (c.t) SCHEMES[c.name] = [c.t % 3 === 0 ? 2 : c.t % 2, A, B]; }
      // data.runoffSchemes: [[corner name, pattern, colour A, colour B], ...] (hex strings) for circuits with their own painted run-off (Monza)
      for (const [nm, pt, ca, cb] of this.data.runoffSchemes || []) SCHEMES[nm] = [pt, lin(ca), lin(cb)];
      const v3 = (c) => 'vec3(' + c.r.toFixed(4) + ', ' + c.g.toFixed(4) + ', ' + c.b.toFixed(4) + ')';
      // house-colour run-off (Yas): the whole apron from the kerb to the wall in the colour, with darker concentric stripes
      // following the track edge, a white line at its outer edge; tyre marks and wear stay on top
      const RC_STRIPES = RC ? `
    float rTq = rGon * step(eiHW + eiKW - 0.05, rAl) * (1.0 - smoothstep(rOuter - 0.3 - rAA, rOuter - 0.3 + rAA, rAl));
    float rDd = rAl - eiHW - eiKW; float rSt = 0.0;
    for (int k = 0; k < 3; k++) { float c0 = 1.9 + float(k) * 2.3; rSt += smoothstep(c0 - rAA, c0 + rAA, rDd) * (1.0 - smoothstep(c0 + 0.9 - rAA, c0 + 0.9 + rAA, rDd)); }
    vec3 rTqC = mix(${v3(lin(RC[2] || RC[0]))}, ${v3(lin(RC[1]))}, rSt * (0.85 + 0.15 * rM1.g)) * (0.9 + 0.12 * rM2.r);
    rTqC = mix(rTqC, vec3(0.72, 0.72, 0.7), 1.0 - smoothstep(0.1, 0.1 + rAA, abs(rAl - rOuter + 0.55)));
    rCol = mix(rCol, mix(rTqC, rBase * 1.05, clamp(rWear * 0.5, 0.0, 0.6)), rTq);
    rGreen = max(rGreen, rTq);
    // painted straight (vTrk3.x red / white flat kerb along the edge, vTrk3.y dark band with white partner lettering beyond it,
    // vTrk3.z distance from the edge where the turquoise strip by the wall starts): the apron between runs dark grey
    if (vTrk3.x > 0.001) {
      float rE = rAl - eiHW; vec3 rDark = rBase * 0.66;
      // the corners' kerb pattern (kerbTexture 'yas'): crimson / white blocks 2 m long
      float rwIn = smoothstep(0.15 - rAA, 0.15 + rAA, rE) * (1.0 - smoothstep(1.75 - rAA, 1.75 + rAA, rE));
      float rRed = rwIn * step(fract(rS / 4.0), 0.5);
      vec3 rRW = mix(vec3(0.74, 0.74, 0.72), vec3(0.5, 0.012, 0.02), rRed) * (0.88 + 0.2 * rM1.g);
      vec3 rSC = mix(rDark, rRW, rwIn);
      float brIn = smoothstep(2.15 - rAA, 2.15 + rAA, rE) * (1.0 - smoothstep(3.65 - rAA, 3.65 + rAA, rE)) * vTrk3.y;
      float rTx = texture2D(eiBrand, vec2(rS / 13.3 * vTrk3.w, clamp((rE - 2.15) / 1.5, 0.0, 1.0))).r * brIn;
      rSC = mix(mix(rSC, vec3(0.04, 0.045, 0.05), brIn), vec3(0.78, 0.78, 0.76), rTx);
      rSC = mix(rSC, rCol, smoothstep(vTrk3.z - rAA, vTrk3.z + rAA, rE));
      rSC = mix(rSC, rSC * 0.6, rTyre * 0.4) * (1.0 - clamp(rWear * 0.25, 0.0, 0.3));
      rCol = mix(rCol, rSC, vTrk3.x * rGon * step(0.0, rE));
    }
` : '';
      let runFrag = RC ? RUNOFF_FRAG.replace('vec3(0.13, 0.235, 0.105)', v3(lin(RC[2] || RC[0]))).replace('    rCol = mix(rCol, rCol * 0.45, rTyre', RC_STRIPES + '    rCol = mix(rCol, rCol * 0.45, rTyre') : RUNOFF_FRAG;
      if (this.data.runoffGreen && !RC) runFrag = runFrag.replace('vec3(0.13, 0.235, 0.105)', v3(lin(this.data.runoffGreen)));   // the painted green band behind the kerbs (Monza: bright grass green)
      // data.runoffRY [band m, colour A, colour B, period m] (Spa 2022+, F1 photos spa_kerb_*): a flat A / B block band painted right behind the kerb, the rest of
      // the strip keeps runoffGreen; data.runoffBands (Spa): run-off pattern 2 paints bands PARALLEL to the edge (A | white | B | white ...), not cross stripes
      const RY = !RC && this.data.runoffRY; const RYK = RY ? '-ry' + RY.join('') + (this.data.runoffBands || '') : '';
      if (RY) runFrag = runFrag.replace('    rCol = mix(rCol, rGreenC * (1.0 - 0.25 * rWear), rGreen);\n', `    rCol = mix(rCol, rGreenC * (1.0 - 0.25 * rWear), rGreen);
    float ryIn = rGreen * (1.0 - smoothstep(eiHW + eiKW + ${RY[0].toFixed(2)} - rAA, eiHW + eiKW + ${RY[0].toFixed(2)} + rAA, rAl));
    vec3 ryC = mix(${v3(lin(RY[1]))}, ${v3(lin(RY[2]))}, step(0.5, fract(rS / ${RY[3].toFixed(2)}))) * (0.88 + 0.2 * rM1.g);
    rCol = mix(rCol, mix(ryC, rBase * 1.05, clamp(rWear * 0.5, 0.0, 0.6)), ryIn);
`);
      if (RY && this.data.runoffBands) runFrag = runFrag.replace('else { P = 12.0; q = rS / P; }', 'else { P = ' + (2 * this.data.runoffBands).toFixed(2) + '; q = (rAl - aw0) / P; }');
      // data.runoffFlag (COTA, photos kerb_stars_banner / mclaren_stands_flag / aerial_tower): two more run-off patterns, bands parallel to the
      // track edge with five-point stars: 4 = stars and stripes (white | B | white | B with white stars | white | A with B / white stars | white,
      // ~9.9 m, then plain asphalt), 5 = a solid A apron with a starred B band (Turn 1). One SDF per fragment, painted rows only.
      const FLAG = !!(this.data.runoffFlag && !RC);
      if (FLAG) runFrag = runFrag.replace('float rTop = pat > 2.5 ? aw0 + 3.2 : rOuter - 0.35;', 'float rTop = pat > 4.5 ? rOuter - 0.35 : pat > 3.5 ? min(rOuter - 0.35, aw0 + 9.85) : pat > 2.5 ? aw0 + 3.2 : rOuter - 0.35;')
        .replace('    rPaint = mix(rPaint, vec3(0.72, 0.72, 0.7), wl);\n', `    rPaint = mix(rPaint, vec3(0.72, 0.72, 0.7), wl);
    if (pat > 3.5) {
      float fd = rAl - aw0; vec3 fW = vec3(0.6, 0.6, 0.585); float fN = 0.88 + 0.22 * rM1.g; vec3 fA = vColA * fN, fB = vColB * fN;
      bool f5 = pat > 4.5; vec3 fC;
      float sb0 = f5 ? 5.35 : (fd < 6.72 ? 3.95 : 6.9); float sb1 = sb0 + (f5 ? 4.65 : 2.6);
      if (f5) { fC = fA; fC = mix(fC, fW, smoothstep(5.0 - rAA, 5.0 + rAA, fd)); fC = mix(fC, fB, smoothstep(5.35 - rAA, 5.35 + rAA, fd)); fC = mix(fC, fW, smoothstep(10.0 - rAA, 10.0 + rAA, fd)); fC = mix(fC, fA, smoothstep(10.35 - rAA, 10.35 + rAA, fd)); }
      else { fC = fW; fC = mix(fC, fB, smoothstep(1.0 - rAA, 1.0 + rAA, fd)); fC = mix(fC, fW, smoothstep(3.6 - rAA, 3.6 + rAA, fd)); fC = mix(fC, fB, smoothstep(3.95 - rAA, 3.95 + rAA, fd));
        fC = mix(fC, fW, smoothstep(6.55 - rAA, 6.55 + rAA, fd)); fC = mix(fC, fA, smoothstep(6.9 - rAA, 6.9 + rAA, fd)); fC = mix(fC, fW, smoothstep(9.5 - rAA, 9.5 + rAA, fd)); }
      float fPer = f5 ? 9.0 : 7.5; float fo = sb0 > 5.0 && !f5 ? 0.5 : 0.0; float fq = rS / fPer + fo; float fCell = floor(fq);
      vec2 sp = vec2(abs((fract(fq) - 0.5) * fPer), fd - 0.5 * (sb0 + sb1)); float fR = f5 ? 1.5 : 1.05;
      vec2 k1 = vec2(0.809017, -0.587785), k2 = vec2(-0.809017, -0.587785);
      sp -= 2.0 * max(dot(k1, sp), 0.0) * k1; sp -= 2.0 * max(dot(k2, sp), 0.0) * k2; sp.x = abs(sp.x); sp.y -= fR;
      vec2 fba = 0.42 * vec2(0.587785, 0.809017) - vec2(0.0, 1.0); float fh = clamp(dot(sp, fba) / dot(fba, fba), 0.0, fR);
      float fsd = length(sp - fba * fh) * sign(sp.y * fba.x - sp.x * fba.y); float fsw = max(fwidth(fsd), 0.004);
      bool fInA = !f5 && sb0 > 5.0; vec3 fSt = fInA && mod(fCell, 2.0) > 0.5 ? fB : fW;
      fC = mix(fC, fW, (1.0 - smoothstep(0.13 - fsw, 0.13 + fsw, fsd)) * (fInA ? 1.0 : 0.0));
      fC = mix(fC, fSt, 1.0 - smoothstep(-fsw, fsw, fsd));
      rPaint = mix(fC, fW, wl);
    }
`);
      const FLAGK = FLAG ? '-flag' + (this.data.runoffGreen || '') : '';
      const aw0 = hw + kw + 2.0;
      const rMat = shaderMat({ map: T.runoff.map, normalMap: T.runoff.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: T.runoff.roughnessMap, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2, ...(this.data.runoffTint ? { color: new THREE.Color().fromArray(this.data.runoffTint) } : {}) }, 'runoff' + (RC ? '-' + RC.join('') + '-sp' : '') + FLAGK + RYK, RC ? Object.assign({}, common, { eiBrand: { value: brandStripTexture() } }) : common, RC ? VARY_RUN_RC : VARY_RUN, runFrag, RC ? RUNOFF_ROUGH + '    roughnessFactor = mix(roughnessFactor, 0.9, rTq);\n' : RUNOFF_ROUGH, FLATTEN);
      const gMat = shaderMat({ map: T.gravel.map, normalMap: T.gravel.normalMap, normalScale: new THREE.Vector2(1.25, 1.25), roughnessMap: T.gravel.roughnessMap, roughness: 1, metalness: 0, color: new THREE.Color(GT.x, GT.y, GT.z), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 3 }, 'gravel', common, VARY4, GRAVEL_FRAG, GRAVEL_ROUGH, '', GRAVEL_NORMAL);
      this.surfMats = { runoff: rMat, gravel: gMat };
      for (const side of [-1, 1]) {
        const run = side < 0 ? this.runoffL : this.runoffR, grav = side < 0 ? this.gravelL : this.gravelR, wall = side < 0 ? this.wallL : this.wallR;
        // outer edge: dilate then smooth so the run-off tapers in and out and never leaves a gap to the gravel; Yas's painted run-off
        // runs right up to the barrier at the corners (no sand / gravel between the paint and the wall unless the corner has a gravel bed)
        const raw = new Float32Array(n); for (let i = 0; i < n; i++) raw[i] = run[i] ? (RC && !grav[i] ? Math.max(hw + kw + 14, wall[i]) : hw + kw + (grav[i] ? 7.05 : 14)) : RC ? hw + kw + (kerbMask(i) ? 9 : 3.4) : kerbMask(i) ? aw0 + 0.05 : hw + 1.0;
        const dil = new Float32Array(n); for (let i = 0; i < n; i++) { let m = 0; for (let j = -4; j <= 4; j++) m = Math.max(m, raw[(i + j + n) % n]); dil[i] = m; }
        const outer = this.smooth(dil, 4); for (let i = 0; i < n; i++) outer[i] = Math.max(hw + 0.6, Math.min(outer[i], wall[i] - 0.4));
        // paint scheme per row (corner name), spread one row so the colour attribute is constant across each paint boundary quad
        const sch = new Int8Array(n).fill(-1); const names = Object.keys(SCHEMES);
        for (let i = 0; i < n; i++) if (run[i]) { const co = this.cornerObj(this.s[i]); let k = co && co.t != null ? names.indexOf(String(co.t)) : -1; if (k < 0) k = names.indexOf(co ? co.name : null); if (k >= 0) sch[i] = k; }   // (a scheme keyed by turn number wins over one keyed by the corner's name)
        const schC = Int8Array.from(sch); for (let i = 0; i < n; i++) if (sch[i] < 0) { for (const j of [1, -1, 2, -2]) { const q = sch[(i + j + n) % n]; if (q >= 0) { schC[i] = q; break; } } }
        const green = new Uint8Array(n); if (!this.data.street) for (let i = 0; i < n; i++) green[i] = kerbMask(i) || run[i] || RC ? 1 : 0;
        // painted straights: per-row weights of the kerb and the brand band on this side (pit side: kerb, then turquoise only in a
        // narrow strip by the wall; the other side: kerb + brand band, not over the first and last `ends` metres)
        const wRW = new Float32Array(n), wBR = new Float32Array(n), tqS = new Float32Array(n).fill(99);
        if (RC) for (const P of this.data.straightPaint || []) {
          const L = this.length, span = U.mod(P.s1 - P.s0, L); const onPit = side === this.pitSideSign();
          for (let i = 0; i < n; i++) {
            const u = U.mod(this.s[i] - P.s0, L); const out = u <= span ? 0 : Math.min(u - span, L - u); const f = 1 - U.smoothstep(0, 25, out); if (f <= 0) continue;
            const endF = Math.min(u, span - u); const mid = P.ends && u <= span ? U.smoothstep(P.ends - 15, P.ends, endF) : 1;
            wRW[i] = Math.max(wRW[i], f); if ((onPit ? P.pit : P.far) === 'brand') wBR[i] = Math.max(wBR[i], mid);
            if (onPit && P.wall) tqS[i] = Math.min(tqS[i], Math.max(2.0, Math.min(P.wall, wall[i] - hw) - 1.3));
          }
        }
        const geo = this.strip(2, {
          lat: (ii, c) => side * (c ? outer[ii] : hw - 0.05), uv: (ii, c, l, i) => [l / 4, i * ds / per(4)],
          attrs: {
            trk: [4, (ii, c, l, i) => [l, i * ds, sch[ii] >= 0 ? 1 : 0, schC[ii] >= 0 ? SCHEMES[names[schC[ii]]][0] : 0]],
            trk2: [4, (ii) => [green[ii], grav[ii] ? hw + kw + 6.9 : 99, aw0, outer[ii]]],
            colA: [3, (ii) => { const c = schC[ii] >= 0 ? SCHEMES[names[schC[ii]]][1] : BLUE; return [c.r, c.g, c.b]; }],
            colB: [3, (ii) => { const c = schC[ii] >= 0 ? SCHEMES[names[schC[ii]]][2] : BLUE; return [c.r, c.g, c.b]; }],
            ...(RC ? { trk3: [4, (ii) => [wRW[ii], wBR[ii], tqS[ii], side]] } : {}),
          },
        });
        const rm = new THREE.Mesh(geo, rMat); rm.receiveShadow = true; rm.name = 'runoff'; rm.position.y = -0.008; g.add(rm);
        this['runoffOuter' + (side < 0 ? 'L' : 'R')] = outer;
        // gravel trap: inner edge behind the painted run-off, out to 1.4 m short of the barrier; the last 1.6 m (and the trap ends, whose
        // width eases in / out over the smoothed presence) fade out through the vertex alpha into the grass verge underneath
        const pres = this.smooth(Float32Array.from(grav), 4);
        const gIn = (ii) => Math.min(hw + kw + 6.9, wall[ii] - 0.5), gOut = (ii) => { const a = gIn(ii); return a + Math.max(0, wall[ii] - 1.4 - a) * U.smoothstep(0.0, 0.75, pres[ii]); };
        const gLat = (ii, c) => { const a = gIn(ii), b = gOut(ii); return c === 0 ? a : c === 1 ? a + (b - a) * 0.5 : c === 2 ? Math.max(a, b - 1.6) : b; };
        const gGeo = this.strip(4, {
          mask: i => pres[i] > 0.03, lat: (ii, c) => side * gLat(ii, c), uv: (ii, c, l, i) => [l / 2.2, i * ds / per(2.2)],
          attrs: {
            trk: [4, (ii, c, l, i) => [l, i * ds, gIn(ii), gOut(ii)]],
            trk2: [4, (ii, c) => [c === 3 ? 0 : U.smoothstep(0.08, 0.6, pres[ii]), pres[ii], 0, 0]],
          },
        });
        const gm = new THREE.Mesh(gGeo, gMat); gm.receiveShadow = true; gm.name = 'gravel'; gm.position.y = -0.012; g.add(gm);
      }

      // ------------------------------------------------ grass verge: detailed grass, worn band at the edge, mown stripes, blends into the terrain colour far out
      const farCol = this.terrainColourSampler();
      // street circuits: the verge stops short of any other stretch of the lap within its 40 m (Beau Rivage runs ~10 m above the
      // harbour front, and a flat ribbon at its level would roof over the road below)
      const desert = !!(this.scenery && this.scenery.env && this.scenery.env.data.kind === 'desert');
      const fEnv = this.scenery && this.scenery.env && this.scenery.env.forestOn ? this.scenery.env : null;   // forest ground (Spa, SPA-STITCH): a narrow draped verge
      const vw = this.data.street || desert ? this.streetVergeWidths() : fEnv ? fEnv.forestVergeW() : null;
      // street circuits on a terrain model: the ribbon runs out from the barriers in steps that follow the ground, so where the hill
      // falls away (the descent from Mirabeau to the hairpin) the verge drapes down the slope instead of hanging flat at road level
      const vsc = vw && this.scenery && this.scenery.heights && this.scenery.env && this.scenery.env.dem ? this.scenery : null; const VF = vsc ? [1, 0.6, 0.3, 0.1, 0] : [1], VK = VF.length * 2;
      const vergeOff = vw ? ((ii, c) => c < VF.length ? -(this.wallL[ii] + vw[0][ii] * VF[c]) : this.wallR[ii] + vw[1][ii] * VF[VK - 1 - c]) : ((ii, c) => c ? this.wallR[ii] + 40 : -(this.wallL[ii] + 40));
      const vFlat = fEnv ? fEnv.forestFlat : 0.5;   // (forest: a level shelf behind the barrier for the debris fence / boards, then the drape)
      const vY = vsc ? ((ii, c, l) => { const w = l < 0 ? this.wallL[ii] : this.wallR[ii]; if (Math.abs(l) < w + vFlat) return 0; const g = vsc.gridHeight(this.x[ii] + this.nx[ii] * l, this.z[ii] + this.nz[ii] * l) - this.y[ii] + 0.25; return Math.max(-40, Math.min(0, g)); }) : null;
      const vGeo = this.strip(VK, {
        lat: vergeOff, y: vY, uv: (ii, c, l, i) => [l / 3, i * ds / per(3)],
        attrs: {
          trk: [4, (ii, c, l, i) => [l, i * ds, this.wallL[ii] + 10, this.wallR[ii] + 10]],
          farL: [3, (ii) => farCol(ii, -1)], farR: [3, (ii) => farCol(ii, 1)],
        },
      });
      // the environment's field map and grass detail multiplier (when present) give the verge exactly the terrain's albedo
      const env = this.scenery && this.scenery.env; const fieldOn = !!(env && env.fieldTex && env._detail && EI.Env && EI.Env.MAP_HALF);
      const vUni = Object.assign({}, common, { eiField: { value: fieldOn ? env.fieldTex : T.aux }, eiDetail: { value: fieldOn ? env._detail : T.aux }, eiFieldOn: { value: fieldOn ? 1 : 0 }, eiMapHalf: { value: fieldOn ? EI.Env.MAP_HALF : 1 }, eiGrassMean: { value: T.grassMean } });
      const vMat = shaderMat({ map: T.grass.map, normalMap: T.grass.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.96, metalness: 0, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 6 }, 'verge', vUni, VARY_VERGE, VERGE_FRAG, '', '');
      const vm = new THREE.Mesh(vGeo, vMat); vm.receiveShadow = true; vm.name = 'verge'; vm.position.y = -0.03; g.add(vm);

      this.buildInfield(g, T, kerbMat);
      this.buildMarkings(g);
    }

    // terrain vertex colour (linear) just beyond the verge, so the verge fades into whatever the terrain shows
    terrainColourSampler() {
      const sc = this.scenery; const terr = sc && sc.group && sc.group.getObjectByName ? sc.group.getObjectByName('terrain') : null;
      const fb = new THREE.Color(0x3f7f22); const fallback = () => [fb.r, fb.g, fb.b];
      if (!terr || !terr.geometry.attributes.color || !sc.tSize) return fallback;
      const col = terr.geometry.attributes.color, size = sc.tSize, segs = sc.tSegs, W = segs + 1;
      return (ii, side) => {
        const d = (side < 0 ? this.wallL[ii] : this.wallR[ii]) + 40; const x = this.x[ii] + this.nx[ii] * side * d, z = this.z[ii] + this.nz[ii] * side * d;
        const fx = U.clamp((x + size / 2) / size * segs, 0, segs - 1e-3), fz = U.clamp((z + size / 2) / size * segs, 0, segs - 1e-3); const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
        const out = [0, 0, 0];
        for (let c = 0; c < 3; c++) { const g = (j) => col.array[j * 3 + c]; const a = g(iz * W + ix), b = g(iz * W + ix + 1), e = g((iz + 1) * W + ix), f = g((iz + 1) * W + ix + 1); out[c] = U.lerp(U.lerp(a, b, tx), U.lerp(e, f, tx), tz); }
        return out;
      };
    }

    // sausage kerbs: raised yellow humps 1.5 m behind the apex kerb on the inside of the slow / medium corners
    buildSausages(g) {
      const hw = this.halfWidth, kw = this.kerbWidth, n = this.n; const kk = this.smooth(this.k, 6);
      const corners = this.data.sausageCorners || ['Abbey', 'Village', 'The Loop', 'Brooklands', 'Luffield', 'Copse', 'Stowe', 'Vale', 'Club'];
      const prof = [[-0.3, 0], [-0.26, 0.07], [-0.17, 0.135], [-0.06, 0.16], [0.06, 0.16], [0.17, 0.135], [0.26, 0.07], [0.3, 0]];
      const pos = [], col = [], idx = []; const yel = new THREE.Color(0xf2b705).convertSRGBToLinear(), dirt = new THREE.Color(0x7a6a3a).convertSRGBToLinear(), blk = new THREE.Color(0x1a1a1a);
      const seen = {}; this.sausages = [];
      const stripe = this.data.kerbStyle === 'monza' || this.data.kerbStyle === 'spa' || this.data.kerbStyle === 'cota';   // Monza's sausage kerbs are yellow with black diagonal bars (refs chicane_yellowblack_sausage)
      this.data.corners.forEach((c, ci) => {
        if (!this.cornerIn(corners, c)) return;
        const next = this.data.corners[ci + 1]; const sEnd = next ? Math.min(next.s, c.s + 200) : c.s + 200;
        let best = -1, bk = 0; const prv = this.data.corners[ci - 1]; for (let s = c.s - (prv && prv.name === c.name ? 4 : 30); s < sEnd; s += this.ds) { const i = this.idxAtS(s); if (Math.abs(kk[i]) > bk) { bk = Math.abs(kk[i]); best = i; } }
        if (best < 0 || bk < 1 / 260 || seen[best]) return; seen[best] = true;
        const side = kk[best] > 0 ? 1 : -1;                        // centre of curvature side = inside
        const wall = side < 0 ? this.wallL[best] : this.wallR[best]; const R = 1 / bk; const lat0 = hw + kw + 1.5 + 0.3;
        if (lat0 + 0.6 > Math.min(wall - 0.5, 0.85 * R)) return;
        const sA = this.s[best]; this.sausages.push({ name: c.name, s: sA, side });
        for (let piece = -1; piece <= 1; piece++) {
          const s0 = sA + piece * 4.4 - 2.0, s1 = s0 + 4.0; const steps = stripe ? 12 : 8;
          for (let r = 0; r <= steps; r++) {
            const fs = r / steps; const f = this.frameAt(s0 + (s1 - s0) * fs); const end = Math.min(1, Math.min(fs, 1 - fs) * 4.5 + 0.12);
            for (let k = 0; k < prof.length; k++) {
              const l = side * (lat0 + prof[k][0]); const h = prof[k][1] * end;
              pos.push(f.x + f.nx * l, f.y + h, f.z + f.nz * l);
              const cc = (k === 0 || k === prof.length - 1) ? dirt : stripe ? (r % 2 ? blk : yel) : (r === 0 || r === steps) ? blk : yel; const t = 0.85 + 0.15 * U.noise2(s0 * 3 + r, k); col.push(cc.r * t, cc.g * t, cc.b * t);
            }
            if (r > 0) { const base = pos.length / 3 - prof.length * 2; for (let k = 0; k < prof.length - 1; k++) { const a = base + k, b = base + prof.length + k; if (side > 0) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1); } }
          }
        }
      });
      if (!idx.length) return;
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide })); m.castShadow = true; m.receiveShadow = true; m.name = 'sausageKerbs'; g.add(m);
    }

    // ------------------------------------------------ Yas's hairpin pocket (aerial imagery, swarm/f1/trackgeo/c_ad_hairpin.jpg): behind the inside
    // barrier the old layout's link road (asphalt with flat kerbs both sides), turquoise paint up to the walls and a pale service strip
    // with a low wall along the exit leg. Road centre line from the imagery; the paint and the strip follow the inner wall line
    buildInfield(g, T, kerbMat) {
      const P = this.infieldPocket(); if (!P) return; const F = this.data.infield, sc = this.scenery, pr = {};
      const gy = (x, z) => (sc && sc.height ? sc.height(x, z) : this.y[this.idxAtS(F.paint[0])]);
      const lin = (h) => new THREE.Color(h).convertSRGBToLinear(); const RC = this.data.runoffColors || ['#1a9db0'];
      const mesh = (pos, uv, idx, mat, name, col) => {
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        if (col) geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(col), 3)); geo.setIndex(idx); geo.computeVertexNormals();
        // ground pieces face up whichever way their rows ran
        if (name !== 'infieldWall') { let ny = 0; const N = geo.attributes.normal; for (let i = 0; i < N.count; i++) ny += N.getY(i); if (ny < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } geo.setIndex(idx); geo.computeVertexNormals(); } }
        const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.name = name; g.add(m); return m;
      };
      const offMat = (o) => Object.assign({ roughness: 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: o, polygonOffsetUnits: o * 2 });
      // flat polygon, triangles split down to ~9 m edges and draped on the ground
      const flat = (poly, dy, uvS, mat, name) => {
        const pos = [], uv = [], idx = []; const tris = THREE.ShapeUtils.triangulateShape(poly.map(p => new THREE.Vector2(p[0], p[1])), []);
        const put = (a, b, c) => { if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) < 0) { const t = b; b = c; c = t; } const k = pos.length / 3; for (const q of [a, b, c]) { pos.push(q[0], gy(q[0], q[1]) + dy, q[1]); uv.push(q[0] / uvS, q[1] / uvS); } idx.push(k, k + 1, k + 2); };
        const split = (a, b, c) => { const L = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]), Math.hypot(a[0] - c[0], a[1] - c[1])); if (L < 9) return put(a, b, c);
          const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; const ab = m(a, b), bc = m(b, c), ca = m(c, a); split(a, ab, ca); split(ab, b, bc); split(ca, bc, c); split(ab, bc, ca); };
        for (const [a, b, c] of tris) split(poly[a], poly[b], poly[c]);
        return mesh(pos, uv, idx, mat, name);
      };
      const turq = lin(RC[0]).multiplyScalar(2.4);
      flat(P.poly, 0.06, 4, new THREE.MeshStandardMaterial(Object.assign(offMat(-1), { map: T.runoff.map, color: turq, emissive: lin(RC[0]).multiplyScalar(0.12) })), 'infieldPaint');
      // the link road: ribbon along the smoothed centre line, rows dropped where the road or its kerbs would reach past the barrier
      const R = F.road; if (R) {
        const curve = new THREE.CatmullRomCurve3(R.pts.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal'); const pts = curve.getSpacedPoints(Math.max(2, Math.round(curve.getLength() / 1.5)));
        const hwR = R.w / 2, kb = R.kerb || 0, cols = [-hwR - kb, -hwR, hwR, hwR + kb];
        const clear = (x, z) => { const p = this.project(x, z, null, pr); return p.dist > (p.lat < 0 ? this.wallL[p.i] : this.wallR[p.i]) + 0.3; };
        const rows = []; let arc = 0;
        pts.forEach((p, k) => {
          const q = pts[Math.min(k + 1, pts.length - 1)], o = pts[Math.max(k - 1, 0)]; let tx = q.x - o.x, tz = q.z - o.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl; const nx = -tz, nz = tx;
          if (k) arc += Math.hypot(p.x - pts[k - 1].x, p.z - pts[k - 1].z);
          const v = cols.map(l => [p.x + nx * l, p.z + nz * l]); rows.push({ v, arc, ok: clear(v[0][0], v[0][1]) && clear(v[3][0], v[3][1]) });
        });
        const strip = (c0, c1, dy, uvF, mat, name, col) => {
          const pos = [], uv = [], idx = [];
          rows.forEach((r, k) => { for (const c of [c0, c1]) { const q = r.v[c]; pos.push(q[0], gy(q[0], q[1]) + dy, q[1]); uv.push(...uvF(c === c0 ? 0 : 1, r.arc)); }
            if (k && r.ok && rows[k - 1].ok) { const a = (k - 1) * 2, b = k * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); } });
          return mesh(pos, uv, idx, mat, name, col);
        };
        strip(1, 2, 0.09, (u, a) => [u * R.w / 4, a / 4], new THREE.MeshStandardMaterial(Object.assign(offMat(-2), { map: T.asphalt.map, color: lin('#9a9a9a') })), 'infieldRoad');
        // flat kerbs, the white rim on the road side (u = 0 at the road edge)
        if (kb) { const km = kerbMat.clone(); Object.assign(km, offMat(-3)); km.roughness = 0.48; strip(1, 0, 0.1, (u, a) => [u, a / 7.2], km, 'infieldKerb', 0.92); strip(2, 3, 0.1, (u, a) => [u, a / 7.2], km, 'infieldKerb', 0.92); }
      }
      // the service strip along the exit leg: pale concrete band from the barrier out to w0 .. w1 m (rounded at its head), a low wall on its
      // open side
      const S = F.strip; if (S) {
        const [s0, s1, w0, w1] = S; const pos = [], uv = [], idx = [], top = []; let k = 0;
        for (let s = s0; s <= s1 + 0.01; s += 2, k++) {
          const u = (s - s0) / (s1 - s0), hd = Math.min(1, (s - s0) / (w0 * 0.5)); const w = (w0 + (w1 - w0) * u) * Math.sqrt(Math.max(0.04, 1 - (1 - hd) * (1 - hd)));
          const a = P.at(s, 0.35), b = P.at(s, 0.35 + w); for (const q of [a, b]) { pos.push(q[0], gy(q[0], q[1]) + 0.1, q[1]); uv.push(q[0] / 4, q[1] / 4); }
          if (k) { const i0 = (k - 1) * 2, i1 = k * 2; idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1); } top.push(b);
        }
        mesh(pos, uv, idx, new THREE.MeshStandardMaterial(Object.assign(offMat(-2), { map: T.runoff.map, color: lin('#d8d2c4') })), 'infieldStrip');
        const wp = [], wu = [], wi = []; const H = 1.0;
        top.forEach((q, j) => { const y = gy(q[0], q[1]); wp.push(q[0], y - 0.1, q[1], q[0], y + H, q[1]); wu.push(j * 0.5, 0, j * 0.5, 1); if (j) { const a = (j - 1) * 2, b = j * 2; wi.push(a, b, a + 1, a + 1, b, b + 1); } });
        mesh(wp, wu, wi, new THREE.MeshStandardMaterial({ color: lin('#e4e2dc'), roughness: 0.8, metalness: 0, side: THREE.DoubleSide }), 'infieldWall');
      }
    }

    // ------------------------------------------------ painted markings: start/finish, grid boxes, DRS lines, run-off logos (one atlas, one material)
    buildMarkings(g) {
      const hw = this.halfWidth, kw = this.kerbWidth; const sf = this.sf;
      const A = paintAtlas();
      const mat = new THREE.MeshStandardMaterial({ map: A.tex, transparent: true, depthWrite: false, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      const b = { pos: [], uv: [], idx: [] };
      // start / finish: chequered band (48 squares across, 4 along)
      this.addDecal(b, sf - 0.6, sf + 0.6, -hw + 0.2, hw - 0.2, (fs, fl) => A.cheq(fl, fs), 2);
      // grid: F1-style white slot brackets with painted position numbers
      for (let p = 0; p < GRID_SLOTS; p++) {
        const s = sf - 10 - p * 8, side = (p % 2 === 0 ? -1 : 1) * 2.6 * (this.data.gridPole === 'left' ? -1 : 1); const cu = (p % 5) / 5, cv = Math.floor(p / 5) / 5;
        // cell covers 3.6 m across x 7.2 m along, front of the slot 3.1 m ahead of the car's centre
        this.addDecal(b, s + 3.1 - 7.2 + 2.2, s + 3.1 + 2.2, side - 1.8, side + 1.8, (fs, fl) => A.grid(cu + (1 - fl) * 0.2, 1 - (cv + (1 - fs) * 0.2)), 3);
      }
      // DRS detection and activation lines across the track
      const wh = () => A.white(0.5, 0.5);
      for (const z of this.drs) { this.addDecal(b, z.detect - 0.15, z.detect + 0.15, -hw + 0.2, hw - 0.2, wh, 1); this.addDecal(b, z.start - 0.2, z.start + 0.2, -hw + 0.2, hw - 0.2, wh, 1); }
      const m = Track.batchMesh(b, mat); m.name = 'paint'; g.add(m);
      // painted partner logos on the run-off at the big corners; decorative: dropped on low quality
      const lb = { pos: [], uv: [], idx: [] }; const aw0 = hw + kw + 2.0;
      const place = (s, side, slot, len) => {
        const outer = side < 0 ? this.runoffOuterL : this.runoffOuterR; const i = this.idxAtS(s); const wdt = outer[i] - aw0 - 1.4; if (wdt < 2.5) return;
        const hgt = Math.min(wdt, len * 0.2); const mid = (aw0 + outer[i]) / 2; const la = side * (mid - hgt / 2), lb2 = side * (mid + hgt / 2);
        // readable from the track looking outwards
        this.addDecal(lb, s - len / 2, s + len / 2, la, lb2, (fs, fl) => { const u = side < 0 ? 1 - fs : fs; return A.logos(u, 1 - (slot + 1 - fl) / 4); }, Math.ceil(len / 1.5), 0.015);
      };
      const L = this.length;
      const spots = this.data.logoSpots || (this.data.street ? [['Nouvelle Chicane', 1, 22], ['Sainte Dévote', 0, 16], ['Tunnel', 2, 18]] : null) || [['Copse', 0, 34], ['Luffield', 1, 30], ['Stowe', 1, 32], ['Club', 2, 26], ['Abbey', 0, 32], ['Village', 1, 26], ['Brooklands', 0, 28], ['Vale', 3, 24], ['Woodcote', 1, 26], ['Maggotts', 0, 26], ['Becketts', 1, 26], ['Chapel Curve', 2, 24], ['The Loop', 3, 20], ['Aintree', 0, 22], ['Farm Curve', 1, 24]];
      for (const [name, slot, len] of spots) {
        const c = this.data.corners.find(cc => typeof name === 'number' ? cc.t === name : cc.name === name); if (!c) continue;
        // the painted run-off is on the outside: find the widest run-off point in the corner
        let best = -1, bw = 0, bside = 1;
        for (let s = c.s; s < c.s + 160; s += 4) { const i = this.idxAtS(U.mod(s, L)); for (const side of [-1, 1]) { const run = side < 0 ? this.runoffL : this.runoffR; const outer = side < 0 ? this.runoffOuterL : this.runoffOuterR; if (run[i] && outer[i] > bw) { bw = outer[i]; best = s; bside = side; } } }
        if (best >= 0) place(best, bside, slot, len);
      }
      if (lb.idx.length) { const lm = Track.batchMesh(lb, mat); lm.name = 'runoffLogos'; lm.userData.decor = true; g.add(lm); }
      // the painted partner patch in a hairpin pocket (data.infieldLogo: { corner, len }), as at Yas's Turn 5 (u5): placed as close to the
      // apex as clears the run-off of both legs (full size first), text reading from behind the apex, draped on the ground; kept on low quality
      const ip = this.data.infieldLogo, ipc = ip && this.data.corners.find(cc => cc.name === ip.corner);
      if (ipc) {
        let ia = -1, km = 0; for (let s = ipc.s - 40; s < ipc.s + 200; s += 2) { const i = this.idxAtS(U.mod(s, L)); if (Math.abs(this.kFold[i]) > km) { km = Math.abs(this.kFold[i]); ia = i; } }
        const sd = this.kFold[ia] > 0 ? 1 : -1, fx = this.nx[ia] * sd, fz = this.nz[ia] * sd, rx = -fz, rz = fx; const pr = {};
        const clear = (x, z) => { const p = this.project(x, z, null, pr); const o = p.lat < 0 ? this.runoffOuterL[p.i] : this.runoffOuterR[p.i]; return p.dist > Math.max(o, hw + kw + 3) + 1.5; };
        let fit = null;
        for (let len = ip.len || 30; len >= 16 && !fit; len -= 2) for (let D = hw + 8; D < 70 && !fit; D += 2) {
          const wd = len * 316 / 940, cx = this.x[ia] + fx * D, cz = this.z[ia] + fz * D; let ok = true;
          for (const a of [-0.5, 0, 0.5]) for (const q of [-0.5, 0.5]) if (ok && !clear(cx + rx * a * len + fx * q * wd, cz + rz * a * len + fz * q * wd)) ok = false;
          if (ok) fit = { cx, cz, len, wd };
        }
        if (fit) {
          const pb = { pos: [], uv: [], idx: [] }, NA = 10, NB = 4, sc = this.scenery;
          for (let j = 0; j <= NB; j++) for (let k = 0; k <= NA; k++) {
            const a = (k / NA - 0.5) * fit.len, q = (j / NB - 0.5) * fit.wd, x = fit.cx + rx * a + fx * q, z = fit.cz + rz * a + fz * q;
            pb.pos.push(x, (sc && sc.height ? sc.height(x, z) : this.y[ia]) + 0.04, z); const t = A.patch(k / NA, j / NB); pb.uv.push(t[0], t[1]);
            if (j && k) { const v = j * (NA + 1) + k; pb.idx.push(v - NA - 2, v - NA - 1, v - 1, v - NA - 1, v, v - 1); }
          }
          const pm = Track.batchMesh(pb, mat); pm.name = 'infieldLogo'; g.add(pm);
        }
      }
    }

    // wall panel artwork: the partners' boards; Yas Marina's walls carry black boards with the white lock-ups and URLs (u3 / u4)
    barrierArt() {
      const A = EI.Ads; const desert = !!(this.scenery && this.scenery.env && this.scenery.env.data.kind === 'desert'); if (!desert) return A.BARRIER;
      if (A.barrierArt) return A.barrierArt({ dark: true });   // Yas: black boards, the venue's partners in white (f1-BRAND)
      const txt = (t, font) => (ctx, w, h) => { ctx.fillStyle = '#0b0c0f'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#ffffff'; ctx.font = '800 ' + Math.round(h * 0.56) + 'px ' + font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, w / 2, h * 0.53); };
      const lock = (brand) => (ctx, w, h) => { ctx.fillStyle = '#0b0c0f'; ctx.fillRect(0, 0, w, h); A.lockupCentered(ctx, brand, w / 2, h / 2, h * 0.6, w * 0.8, '#ffffff', true); };
      const F = '"Plus Jakarta Sans", Arial, sans-serif';
      return [lock('lumi'), txt('intake.ink', F), txt('trylumi.co', F), lock('intake'), txt('Ask Lumi.', F)];
    }
    buildBarriers(g) {
      if (this.data.street) { this.buildStreetBarriers(g); return; }
      const kk = this.smooth(this.k, 12);
      // sponsor wall panels (concrete wall with advertising) in corners, Armco on straights, tyre walls at the big stops.
      // One atlas for all four: each is a band across u (0 = bottom of the wall, 1 = top) and repeats along v (the lap distance);
      // a second texture with the same layout carries roughness (G) and metalness (B)
      // AH 2048 (f1-BRAND): 80 px per metre along the wall for the partner panels (was 40 px/m: text blurred along the wall); the
      // roughness / metalness canvas is uniform along v, so it stays 1024 high
      const AW = 640, AH = 2048;
      const ca = document.createElement('canvas'); ca.width = AW; ca.height = AH; const cx = ca.getContext('2d');
      const cr = document.createElement('canvas'); cr.width = AW; cr.height = 1024; const rx = cr.getContext('2d');
      const band = (k, rough, metal) => { rx.fillStyle = 'rgb(255,' + Math.round(rough * 255) + ',' + Math.round(metal * 255) + ')'; rx.fillRect(k * 128, 0, 128, AH); };
      // panels: 5 partner boards along 25.6 m, text running along the wall (drawn rotated: canvas y is the lap direction).
      // Band 0 reads left to right along +s (left-hand wall), band 4 is the same art flipped along the lap for the right-hand wall
      { const ph = AH / 5; this.barrierArt().forEach((paint, i) => { for (const flip of [0, 1]) { cx.save(); cx.beginPath(); cx.rect(flip * 512, i * ph, 128, ph); cx.clip(); cx.translate(flip * 512 + 128, i * ph + flip * ph); cx.rotate(Math.PI / 2); if (flip) cx.scale(-1, 1); const vw = 128 * EI.Ads.BARRIER_ASPECT; cx.scale(ph / vw, 1); paint(cx, vw, 128); cx.restore(); } });
        band(0, 0.5, 0); band(4, 0.5, 0); }
      // tyre wall: stacks of 4 tyres, 4 stacks per 2.6 m, white / red marker stacks
      { cx.fillStyle = '#151515'; cx.fillRect(128, 0, 128, AH); const cols = ['#202020', '#202020', '#e8e8e8', '#202020', '#c81418', '#202020', '#202020', '#202020'];
        for (let st = 0; st < 4; st++) for (let t = 0; t < 4; t++) { cx.fillStyle = cols[(st * 4 + t) % cols.length]; const y = st * AH / 4; cx.beginPath(); if (cx.roundRect) cx.roundRect(128 + t * 32 + 2, y + 6, 28, AH / 4 - 12, 10); else cx.rect(128 + t * 32 + 2, y + 6, 28, AH / 4 - 12); cx.fill(); cx.fillStyle = 'rgba(0,0,0,0.45)'; cx.fillRect(128 + t * 32 + 14, y + 6, 4, AH / 4 - 12); }
        band(1, 0.9, 0); }
      // Armco: two corrugations running along the rail, a post every 4 m
      { const g2 = cx.createLinearGradient(256, 0, 384, 0); [[0, '#7d8186'], [0.15, '#c9ccd0'], [0.3, '#8b8f94'], [0.5, '#7a7e83'], [0.65, '#c9ccd0'], [0.8, '#8b8f94'], [1, '#6f7378']].forEach(([o, c]) => g2.addColorStop(o, c));
        cx.fillStyle = g2; cx.fillRect(256, 0, 128, AH); cx.fillStyle = 'rgba(40,42,46,0.6)'; cx.fillRect(256, 0, 128, 18); band(2, 0.4, 0.6); }
      // concrete
      { cx.fillStyle = '#d9d9d6'; cx.fillRect(384, 0, 128, AH); const r = U.rng(5); for (let i = 0; i < 900; i++) { cx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'; cx.fillRect(384 + r() * 126, r() * AH, 2, 2); } band(3, 0.9, 0); }
      const atl = U.srgb(canvasTex(ca, true)), rmt = canvasTex(cr, true); atl.wrapS = rmt.wrapS = THREE.ClampToEdgeWrapping;
      const barMat = new THREE.MeshStandardMaterial({ map: atl, roughnessMap: rmt, metalnessMap: rmt, roughness: 1, metalness: 1, side: THREE.DoubleSide });
      const toBand = (geo, k) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, (k * 128 + 3 + uv.getX(i) * 122) / AW); return geo; };
      const tyreCorners = this.data.tyreCorners || ['Copse', 'Stowe', 'Club', 'Village', 'Vale']; const armco = this.data.barrier === 'armco';
      const cornerAt = (s) => { let name = null; for (const c of this.data.corners) if (s >= c.s - 60) name = c.name; return name; };
      for (const side of [-1, 1]) {
        const wall = side < 0 ? this.wallL : this.wallR;
        const inCorner = i => Math.abs(kk[i]) > 1 / 600;
        const isTyre = i => inCorner(i) && this.cornerIn(tyreCorners, this.cornerObj(this.s[i])) && (side < 0 ? kk[i] > 0 : kk[i] < 0);
        const isPanel = i => !armco && !isTyre(i) && (inCorner(i) || Math.abs(this.s[i] - this.sf) < 500);
        // concrete base + panels
        // v along the wall's own length (not the centre line: no stretch in corners), each panel run scaled to a whole number of
        // 5.12 m boards so no board is cut at a run end (<= half a board of error spread over the run; f1-BRAND)
        const pv = (() => { const n = this.n, v = new Float32Array(n + 1), on = (i) => { const ii = i % n; return isPanel(ii) || isPanel((ii + n - 1) % n); };
          const wx = (i) => this.x[i % n] + this.nx[i % n] * side * wall[i % n], wz = (i) => this.z[i % n] + this.nz[i % n] * side * wall[i % n];
          for (let r0 = 0; r0 <= n;) { if (!on(r0)) { r0++; continue; } let r1 = r0; while (r1 + 1 <= n && on(r1 + 1)) r1++;
            const arc = [0]; for (let i = r0 + 1; i <= r1; i++) arc.push(arc[arc.length - 1] + Math.hypot(wx(i) - wx(i - 1), wz(i) - wz(i - 1)));
            const len = arc[arc.length - 1] || 1, sc = Math.max(1, Math.round(len / 5.12)) * 5.12 / len; for (let i = r0; i <= r1; i++) v[i] = arc[i - r0] * sc / 25.6; r0 = r1 + 1; }
          return v; })();
        const pg = toBand(this.ribbon(i => side * wall[i], i => side * wall[i], { mask: isPanel, ya: () => 0.5, yb: () => 1.2, vFn: (i) => pv[i] }), side < 0 ? 0 : 4);
        g.add(new THREE.Mesh(pg, barMat));
        const cg = toBand(this.ribbon(i => side * wall[i], i => side * wall[i], { mask: isPanel, ya: () => 0, yb: () => 0.5 }), 3);
        const cm = new THREE.Mesh(cg, barMat); cm.castShadow = true; g.add(cm);
        const tg = toBand(this.ribbon(i => side * wall[i], i => side * wall[i], { mask: isTyre, ya: () => 0, yb: () => 1.0, vScale: 2.6 }), 1);
        const tm = new THREE.Mesh(tg, barMat); tm.castShadow = true; g.add(tm);
        const ag = toBand(this.ribbon(i => side * wall[i], i => side * wall[i], { mask: i => !isTyre(i) && !isPanel(i), ya: () => 0.1, yb: () => 0.8, vScale: 4 }), 2);
        g.add(new THREE.Mesh(ag, barMat));
      }
      // debris fence
      const fenceTex = (function (mesh) { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 64, 64); ctx.strokeStyle = mesh || 'rgba(30,30,30,0.85)';   // data.fence.mesh: the wire colour (Spa: dark green)
        ctx.lineWidth = 1.2;
        for (let i = 0; i <= 64; i += 6) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke(); } ctx.fillStyle = mesh || '#555'; ctx.fillRect(0, 0, 3, 64);
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; })((this.data.fence || {}).mesh);
      const FD = this.data.fence || {}; const TD0 = this.data.tunnel;   // data.fence { h, op }: catch-fence height and opacity (Monza: 4.5 m)
      const fenceMat = new THREE.MeshBasicMaterial({ map: fenceTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: FD.op || 0.7, color: FD.color != null ? FD.color : 0xffffff });
      // data.fence.runs [[s0, s1, side (0 = both), height m]]: later runs override earlier ones, height 0 = no fence (Monza: tall catch fence by the stands, low along the pit wall)
      const fenceH = (i, side, h0) => { let h = h0; if (FD.runs) for (const r of FD.runs) { if (r[2] && r[2] !== side) continue; const sv = this.s[i]; if (r[0] <= r[1] ? (sv >= r[0] && sv <= r[1]) : (sv >= r[0] || sv <= r[1])) h = r[3]; } return h; };
      this.fenceH = fenceH;
      // data.fence.ground (COTA): behind a barrier the drawn ground can lie below the road (cut / fill slopes, the pit side of the T1 climb): the net and its posts then
      // stand on it (drop m below the road level, 0..4) instead of hanging over the slope. Off by default: other circuits are unchanged
      const fGr = FD.ground && this.scenery && this.scenery.height ? this.scenery : null; const fDrop = {};
      if (fGr) for (const side of [-1, 1]) { const w0 = side < 0 ? this.wallL : this.wallR; const a = new Float32Array(this.n); for (let i = 0; i < this.n; i++) { const d = w0[i] + 0.8; const dz = this.y[i] - fGr.height(this.x[i] + this.nx[i] * side * d, this.z[i] + this.nz[i] * side * d); a[i] = dz > 0.03 ? Math.min(4, dz + 0.2) : 0; } fDrop[side] = a; }   // (+0.2: a post's foot sits just in the ground)
      for (const side of [-1, 1]) {
        const wall = side < 0 ? this.wallL : this.wallR; const fd = fDrop[side];
        const TD = this.data.tunnel; const fg = this.ribbon(i => side * (wall[i] + 0.8), i => side * (wall[i] + 0.8), { ya: fd ? (i => -fd[i]) : () => 0, yb: (i) => fenceH(i, side, FD.h || 3.4) - (fd ? fd[i] : 0), vScale: 3, mask: TD || FD.runs ? (i => (!TD || this.s[i] < TD.s0 - 6 || this.s[i] > TD.s1 + 6) && fenceH(i, side, 1) > 0) : undefined });
        const fm = new THREE.Mesh(fg, fenceMat); fm.name = 'fence'; g.add(fm);
      }
      // catch-fence posts (data.fence.posts = spacing in metres): grey galvanised posts with the top leaning towards the track (Monza refs m15_t1exit)
      if (FD.posts) {
        const pp = [], pi = []; const step = Math.max(1, Math.round(FD.posts / this.ds)); const lean = 0.7, th = 0.07;
        const prism = (ax, ay, az, bx, by, bz, tx, tz) => { const b = pp.length / 3; for (const [x, y, z] of [[ax, ay, az], [bx, by, bz]]) for (const [u, v] of [[-1, -0.6], [1, -0.6], [0, 1]]) pp.push(x + tx * th * u - tz * th * v, y, z + tz * th * u + tx * th * v); for (let k = 0; k < 3; k++) { const k2 = (k + 1) % 3; pi.push(b + k, b + k2, b + 3 + k, b + k2, b + 3 + k2, b + 3 + k); } };
        for (const side of [-1, 1]) {
          const wall = side < 0 ? this.wallL : this.wallR;
          for (let i = 0; i < this.n; i += step) {
            if (TD0 && this.s[i] > TD0.s0 - 6 && this.s[i] < TD0.s1 + 6) continue;
            const Hh = fenceH(i, side, FD.h || 4.5); if (Hh <= 0) continue;
            const d = wall[i] + 0.8, d2 = d - side * 0 ; const x = this.x[i] + this.nx[i] * side * d, z = this.z[i] + this.nz[i] * side * d, y = this.y[i] - (fDrop[side] ? fDrop[side][i] : 0); const ex = -this.nx[i] * side * lean, ez = -this.nz[i] * side * lean;
            prism(x, y, z, x, y + Hh - 0.9, z, this.tx[i], this.tz[i]); prism(x, y + Hh - 0.9, z, x + ex, y + Hh, z + ez, this.tx[i], this.tz[i]);
          }
        }
        const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); pg.setIndex(pi); pg.computeVertexNormals();
        const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: FD.postColor != null ? FD.postColor : 0x6f7378, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide })); pm.name = 'fencePosts'; g.add(pm);
      }
    }

    // verge width per side [L, R]: out to 40 m, cut 2 m before the first point that belongs to another stretch of the lap
    streetVergeWidths() {
      if (this._svw) return this._svw;
      const n = this.n, out = [new Float32Array(n), new Float32Array(n)], pr = {};
      // desert circuits: the verge also stops at the water's edge (the marina comes right up to the barriers round the hotel)
      const env = this.scenery && this.scenery.env; const sea = env && env.data.kind === 'desert' && env.seaMask ? (x, z) => env.isSea(x, z) : null;
      for (const [k, side] of [[0, -1], [1, 1]]) {
        const wall = side < 0 ? this.wallL : this.wallR; const raw = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          // brute-force nearest sample (project() can settle on the wrong stretch between two close ones)
          let w = 40; for (let d = 1; d <= 40; d += 1.5) { const l = wall[i] + d; const px = this.x[i] + this.nx[i] * side * l, pz = this.z[i] + this.nz[i] * side * l; if (sea && sea(px, pz)) { w = Math.max(0.5, d - 2); break; } let bj = 0, bd = Infinity; for (let j = 0; j < n; j += 2) { const dd = (this.x[j] - px) ** 2 + (this.z[j] - pz) ** 2; if (dd < bd) { bd = dd; bj = j; } } let di = Math.abs(bj - i); di = Math.min(di, n - di); if (di > 25 && Math.sqrt(bd) < Math.max(this.wallL[bj], this.wallR[bj]) + 6) { w = Math.max(0.5, d - 2); break; } }
          raw[i] = w;
        }
        // erode (take the local minimum) then smooth so the cut edge is clean
        const er = new Float32Array(n); for (let i = 0; i < n; i++) { let m = 40; for (let j = -4; j <= 4; j++) m = Math.min(m, raw[(i + j + n) % n]); er[i] = m; }
        out[k] = this.smooth(er, 3);
      }
      return (this._svw = out);
    }
    // ---------------------------------------------------------------- street circuit (Monaco): barriers and street-level detail
    // per side zone arrays from the data: red / white block barriers, tyre walls, partner sleeves on the rails, pit-road openings,
    // and how far the rail stands back from the physical wall line where blocks or tyres sit in front of it
    streetZones() {
      if (this._sz) return this._sz;
      const ST = this.data.street, n = this.n, L = this.length; const kk = this.smooth(this.k, 12);
      const inR = (s, a, b) => (a <= b ? s >= a && s <= b : s >= a || s <= b);
      // 'out' / 'in' resolve against the net turn of the stretch (k > 0 bends towards +lat, so its outside is side -1)
      const sideOf = (spec, a, b) => { if (spec === 1 || spec === -1) return spec; let sum = 0; for (let s = a; s <= b; s += 2) sum += kk[this.idxAtS(s)]; const out = sum > 0 ? -1 : 1; return spec === 'out' ? out : -out; };
      const Z = {}; for (const side of [-1, 1]) Z[side] = { tec: new Uint8Array(n), tyre: new Uint8Array(n), cover: new Int8Array(n).fill(-1), gap: new Uint8Array(n), island: new Uint8Array(n), back: new Float32Array(n) };
      const mark = (list, key, val) => (list || []).forEach((r, k) => { const sd = sideOf(r[2], r[0], r[1]); const A = Z[sd][key]; for (let i = 0; i < n; i++) if (inR(this.s[i], r[0], r[1])) A[i] = typeof val === 'function' ? val(k) : val; });
      mark(ST.tecpro, 'tec', 1); mark(ST.tyres, 'tyre', 1); mark(ST.covers, 'cover', (k) => ST.covers[k][3] != null ? ST.covers[k][3] : k % 4);
      // the hairpin's planted island replaces the inside rail
      const isl = EI.StreetKit && EI.StreetKit.hairpin ? EI.StreetKit.hairpin(this) : null;
      if (isl) for (let i = 0; i < n; i++) if (inR(this.s[i], isl.s0, isl.s1)) Z[isl.side].island[i] = 1;
      // pit road openings: where the lane's road (half width ~4.5 m) crosses the barrier line on the pit side
      const pit = this.data.pit; if (pit && pit.length > 3) {
        const curve = new THREE.CatmullRomCurve3(pit.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal'); const pts = curve.getSpacedPoints(Math.round(curve.getLength()));
        const pr = {}; let sum = 0; for (const p of pts) { this.project(p.x, p.z, null, pr); sum += pr.lat; } const ps = sum < 0 ? -1 : 1; const wall = ps < 0 ? this.wallL : this.wallR;
        for (const p of pts) { this.project(p.x, p.z, null, pr); if (pr.lat * ps <= 0) continue; if (Math.abs(Math.abs(pr.lat) - wall[pr.i]) < 4.6) for (let j = -2; j <= 2; j++) Z[ps].gap[(pr.i + j + n) % n] = 1; }
        this.pitSideStreet = ps;
      }
      // the rail stands back behind blocks (0.85 m) and tyres (0.72 m), easing in over a few metres
      for (const side of [-1, 1]) { const z = Z[side]; const raw = new Float32Array(n); for (let i = 0; i < n; i++) raw[i] = z.tec[i] ? 0.85 : z.tyre[i] ? 0.72 : 0; const dil = new Float32Array(n); for (let i = 0; i < n; i++) { let m = 0; for (let j = -3; j <= 3; j++) m = Math.max(m, raw[(i + j + n) % n]); dil[i] = m; } z.back = this.smooth(dil, 2); }
      this._sz = Z; return Z;
    }
    // street circuit (Monaco): sun visibility of the road surface, baked once at load (MONACO-UPGRADE). Low has no shadow map, so the
    // whole lap was in full sun; real Monaco is a canyon of sun and deep shade. Each road texel (16 across, one per track sample along)
    // marches towards the sun (EI.look elev / azim) against the city's building prisms (env_city.js shadowPrisms); the sun stands over the sea,
    // so the terrain (north of the road) never shades it and is not tested.
    // A small luminance texture read by the street asphalt shader (no new program, no draw call); the tunnel stays lit (tunnelLight dims it).
    streetShade() { try { return this._streetShade(); } catch (e) { console.warn('streetShade', e); return null; } }
    _streetShade() {
      const sc = this.scenery, PR = sc && sc.shadowPrisms; if (!PR || !PR.length || typeof document === 'undefined') return null;
      const T0 = performance.now(); const n = this.n, NL = 16, hw = this.halfWidth, LK = EI.look || { elev: 52, azim: 338 }, D2R = Math.PI / 180;
      const ph = (90 - LK.elev) * D2R, th = LK.azim * D2R; const sx = Math.sin(ph) * Math.sin(th), sy = Math.cos(ph), sz = Math.sin(ph) * Math.cos(th); const hl = Math.hypot(sx, sz) || 1;
      const dx = sx / hl, dz = sz / hl, tanE = sy / hl; const CS = 16; const grid = new Map(); let top = -1e9;
      PR.forEach((q, k) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const v of q[0]) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); z0 = Math.min(z0, v[1]); z1 = Math.max(z1, v[1]); } top = Math.max(top, q[2]);
        for (let gx = Math.floor(x0 / CS); gx <= Math.floor(x1 / CS); gx++) for (let gz = Math.floor(z0 / CS); gz <= Math.floor(z1 / CS); gz++) { const key = gx * 100003 + gz; let c = grid.get(key); if (!c) grid.set(key, c = []); c.push(k); } });
      const TD = this.data.tunnel; const raw = new Float32Array(n * NL);
      for (let i = 0; i < n; i++) {
        const s = this.s[i]; const inT = TD && s > TD.s0 - 4 && s < TD.s1 + 4;
        for (let l = 0; l < NL; l++) {
          if (inT) { raw[l * n + i] = 1; continue; }
          const lat = ((l + 0.5) / NL * 2 - 1) / 0.94 * hw; const x = this.x[i] + this.nx[i] * lat, z = this.z[i] + this.nz[i] * lat, y = this.y[i] + 0.25; let lit = 1;
          for (let d = 0.8; d < 110; d += 1.6) { const py = y + d * tanE; if (py > top) break; const px = x + dx * d, pz = z + dz * d;
            const c = grid.get(Math.floor(px / CS) * 100003 + Math.floor(pz / CS)); if (!c) continue;
            for (const k of c) { const q = PR[k]; if (py < q[1] || py > q[2]) continue; if (U.pointInPoly(px, pz, q[0])) { lit = 0; break; } } if (!lit) break; }
          raw[l * n + i] = lit;
        }
      }
      // soften: a 3-sample blur along the lap (the penumbra of a 20 m building is ~0.2 m per metre of height; texels are ~1 m x 0.7 m)
      const data = new Uint8Array(n * NL * 4); let litN = 0;
      for (let l = 0; l < NL; l++) for (let i = 0; i < n; i++) { const v = (raw[l * n + (i + n - 1) % n] + 2 * raw[l * n + i] + raw[l * n + (i + 1) % n]) / 4; litN += raw[l * n + i]; const o = (l * n + i) * 4; data[o] = data[o + 1] = data[o + 2] = Math.round(v * 255); data[o + 3] = 255; }
      const tex = new THREE.DataTexture(data, n, NL, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
      this.shadeStats = { ms: Math.round(performance.now() - T0), lit: Math.round(litN / (n * NL) * 100), prisms: PR.length };
      return tex;
    }
    streetTextures() {
      if (Track._stex) return Track._stex;
      const X = {}; const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }; const r = U.rng(606);
      // galvanised rail: u across (bottom -> top of the rail stack), v along (4 m tile): mottled zinc, darker lower edges, bolts at the posts
      { const [c, x] = cv(128, 512); x.fillStyle = '#a9aeb2'; x.fillRect(0, 0, 128, 512);
        for (let i = 0; i < 2600; i++) { const v = 150 + r() * 70; x.fillStyle = 'rgba(' + v + ',' + (v + 3) + ',' + (v + 6) + ',0.35)'; x.fillRect(r() * 128, r() * 512, 1 + r() * 4, 1 + r() * 9); }
        for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(60,62,64,' + (0.05 + r() * 0.1) + ')'; x.fillRect(r() * 128, r() * 512, 2 + r() * 10, 20 + r() * 80); }
        for (let b = 0; b < 4; b++) { const u0 = (0.1 + b * 0.262) / 1.15 * 128, u1 = (0.1 + (b + 1) * 0.262) / 1.15 * 128; const g = x.createLinearGradient(u0, 0, u1, 0);
          [[0, 'rgba(30,32,36,0.55)'], [0.12, 'rgba(255,255,255,0.0)'], [0.3, 'rgba(255,255,255,0.28)'], [0.5, 'rgba(40,42,46,0.32)'], [0.7, 'rgba(255,255,255,0.22)'], [0.9, 'rgba(255,255,255,0.05)'], [1, 'rgba(30,32,36,0.5)']].forEach(([o, c]) => g.addColorStop(o, c)); x.fillStyle = g; x.fillRect(u0, 0, u1 - u0, 512); }
        x.fillStyle = 'rgba(30,30,32,0.45)'; x.fillRect(0, 0, 128, 3); x.fillRect(0, 256, 128, 2);
        for (let p = 0; p < 2; p++) for (let b = 0; b < 4; b++) { x.fillStyle = 'rgba(40,40,42,0.8)'; for (const dx of [-10, 10]) { x.beginPath(); x.arc(14 + b * 29.5, p * 256 + 128 + dx, 2.4, 0, 6.283); x.fill(); } }
        X.rail = U.srgb(canvasTex(c, true)); }
      // partner sleeves over the rails: 8 rows of two boards (4 m x 1 m each), u along, v across
      { const [c, x] = cv(1024, 1024); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 1024, 1024);
        const B = EI.Ads && EI.Ads.BARRIER && this.barrierArt(); for (let k = 0; k < 8; k++) for (let j = 0; j < 2; j++) { x.save(); x.beginPath(); x.rect(j * 512, k * 128, 512, 128); x.clip(); x.translate(j * 512, k * 128); const vw = 128 * 4; x.scale(512 / vw, 1); if (B) B[(k * 2 + j) % B.length](x, vw, 128); else { x.fillStyle = k % 2 ? '#1a3d6e' : '#0d5e52'; x.fillRect(0, 0, vw, 128); } x.restore(); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(j * 512, k * 128, 3, 128); }
        weather(x, 1024, 1024, 61, 5000); X.cover = U.srgb(canvasTex(c, true)); X.cover.wrapT = THREE.ClampToEdgeWrapping; }
      // chain-link mesh (0.5 m tile, diamond weave, ~6 cm cells): alpha; mipmaps fade it to a light haze in the distance
      { const [c, x] = cv(64, 64); x.clearRect(0, 0, 64, 64); x.strokeStyle = 'rgba(196,200,204,1)'; x.lineWidth = 1.1;
        for (let k = -64; k <= 128; k += 8) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 64, 64); x.stroke(); x.beginPath(); x.moveTo(k, 64); x.lineTo(k + 64, 0); x.stroke(); }
        X.mesh = canvasTex(c, true); X.mesh.anisotropy = 4; }
      // masonry: rough cut limestone blocks in courses (retaining walls)
      { const [c, x] = cv(512, 256); x.fillStyle = '#b8a888'; x.fillRect(0, 0, 512, 256);
        for (let row = 0; row < 8; row++) { let px = -r() * 40; const h = 32; while (px < 512) { const w = 40 + r() * 60; const v = 150 + r() * 50; x.fillStyle = 'rgb(' + (v + 20 | 0) + ',' + (v + 8 | 0) + ',' + (v - 14 | 0) + ')'; x.fillRect(px + 1.5, row * h + 1.5, w - 3, h - 3); for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(' + (r() < 0.5 ? '60,50,40' : '240,230,210') + ',' + (0.08 + r() * 0.12) + ')'; x.fillRect(px + r() * w, row * h + r() * h, 1 + r() * 4, 1 + r() * 3); } px += w; } }
        x.fillStyle = 'rgba(70,60,40,0.18)'; for (let i = 0; i < 30; i++) x.fillRect(r() * 512, 0, 2 + r() * 6, 256);
        X.stone = U.srgb(canvasTex(c, true)); }
      // painted road markings: white base with wear (tinted per vertex: white, yellow, dark metal for covers and grates)
      { const [c, x] = cv(128, 128); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 900; i++) { x.fillStyle = 'rgba(70,70,70,' + (0.1 + r() * 0.35) + ')'; x.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1 + r() * 3); }
        X.paint = U.srgb(canvasTex(c, true)); }
      // manhole / drain grate cell (u, v in 0..1 over one cover)
      { const [c, x] = cv(128, 128); x.fillStyle = '#5a5b5e'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#3c3d40'; for (let k = 8; k < 128; k += 12) x.fillRect(k, 10, 6, 108); x.strokeStyle = '#77787c'; x.lineWidth = 6; x.strokeRect(3, 3, 122, 122);
        X.grate = U.srgb(canvasTex(c, false)); }
      Track._stex = X; return X;
    }
    // street circuit barriers, written into the scenery's street world (cells, shared atlas material): triple galvanised W-beam rails on
    // posts (profiled strip, adaptive sampling, bolts in the atlas, a plain back), partner sleeves, chain-link debris fence with posts,
    // overhanging catch arms, braces, tensioned catch cables and marshal gates, TecPro blocks with straps, belted tyre walls, foam end
    // blocks and marker poles at the pit road openings
    buildStreetBarriers(g) {
      const SKx = EI.StreetKit, sc = this.scenery; if (!SKx || !sc || !SKx.World) return;
      const n = this.n, ds = this.ds; const Z = this.streetZones(); const X = this.streetTextures(); const TD = this.data.tunnel; const AT = SKx.Atlas; const W = SKx.world(sc);
      const lin = (h) => new THREE.Color(h).convertSRGBToLinear(); const L = this.length; const I4 = new THREE.Matrix4();
      const inTunnel = (i) => TD && this.s[i] > TD.s0 - 6 && this.s[i] < TD.s1 + 6;
      // ---- atlas regions
      const fromCanvas = (img) => (x, w, h) => x.drawImage(img, 0, 0, w, h);
      const rail = AT.region('rail', 128, 512, fromCanvas(X.rail.image), (x, w, h) => {
        // height: the bolt heads at the posts (4 m tile = 2 posts) and the lapped rail joints
        for (let p = 0; p < 2; p++) for (let b = 0; b < 3; b++) for (const dy of [-11, 11]) { const cx = (0.155 + b * 0.31 + 0.1) / 1.15 * w * 0.86 + 6, cy = p * h / 2 + h / 4 + dy; const gr = x.createRadialGradient(cx, cy, 0, cx, cy, 4.5); gr.addColorStop(0, 'rgb(230,230,230)'); gr.addColorStop(1, 'rgba(128,128,128,0)'); x.fillStyle = gr; x.fillRect(cx - 5, cy - 5, 10, 10); }
        x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, h / 4 - 16, w, 32); x.fillStyle = 'rgb(110,110,110)'; x.fillRect(0, h / 4 - 17, w, 1.5); x.fillRect(0, h / 4 + 16, w, 1.5);
      }, (x, w, h) => { const r = U.rng(3); for (let i = 0; i < 700; i++) { const v = 100 + r() * 70 | 0; x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(r() * w, r() * h, 2 + r() * 6, 3 + r() * 20); } }, 'v');
      // partner sleeves (8 m repeat): single strong colours with white lettering, as the real ones (street.covers [s0, s1, side, design])
      const SLV = [['#4a2a4c', 'lumi'], ['#1f5f9e', 'intake.ink'], ['#141416', 'trylumi.co'], ['#d8343a', 'Ask Lumi.']];
      // the venue's partner panels (EI.Ads.barrierArt: TAG Heuer / Louis Vuitton / MSC + Lumi and Intake) when available, each 4 x 0.88 m half
      // laid out at its true aspect (f1-BRAND); the hand-set lettering below is the fallback
      const BA = EI.Ads && EI.Ads.barrierArt ? EI.Ads.barrierArt() : null; let SLA = BA && BA.length >= 5 ? [[BA[0], BA[0]], [BA[2], BA[2]], [BA[3], BA[3]], [BA[1], BA[4]]] : null;
      // data.street.sleeves (Monaco): the event's own sleeve designs, one per cover design index - 'id' (both halves) or 'idA/idB', 'L' / 'I' =
      // Lumi / Intake; partners on their real board colours (TAG Heuer, F1, Louis Vuitton, Qatar Airways, AWS, Heineken ... as in the photos)
      const SLD = this.data.street && this.data.street.sleeves;
      if (SLD && BA && BA.length >= 5 && EI.Ads.partnerBoard) { const BD = EI.Ads.barrierArt({ dark: true }) || BA; const pnt = (id) => id === 'L' ? BD[1] : id === 'I' ? BD[4] : (x, w, h) => EI.Ads.partnerBoard(x, id, w, h, { lh: 0.6, repeat: 1 }); SLA = SLD.map((d) => { const [a, b] = d.split('/'); return [pnt(a), pnt(b || a)]; }); while (SLV.length < SLA.length) SLV.push(['#141416', '']); }
      const sleeves = SLV.map(([bg, txt], k) => AT.region('armSleeve' + k, 512, 64, (x, w, h) => { x.fillStyle = bg; x.fillRect(0, 0, w, h);
        if (SLA) for (let j = 0; j < 2; j++) { x.save(); x.beginPath(); x.rect(j * w / 2, 0, w / 2, h); x.clip(); x.translate(j * w / 2, 0); const vw = h * 4.55; x.scale((w / 2) / vw, 1); SLA[k][j](x, vw, h); x.restore(); }
        x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(0, 2, w, 2); x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(0, h - 4, w, 4);
        if (!SLA) for (let j = 0; j < 2; j++) { const cx = w / 4 + j * w / 2; if (txt === 'lumi' && EI.Ads) EI.Ads.lockupCentered(x, 'lumi', cx, h * 0.5, h * 0.62, w * 0.4, '#ffffff', true);
          else { x.fillStyle = '#ffffff'; x.font = '800 ' + Math.round(h * 0.5) + 'px "Plus Jakarta Sans", "Titillium Web", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, cx, h * 0.54, w * 0.42); } }
        weather(x, w, h, 61 + k, 70); }, (x, w, h) => { x.fillStyle = 'rgb(120,120,120)'; x.fillRect(0, 0, w, 3); x.fillRect(0, h - 3, w, 3); }, null, 'u'));
      // (thin dark wire: the real fences are black-coated mesh that reads see-through, not a grey veil over the city - MONACO-UPGRADE)
      const chain = AT.region('chain', 64, 64, (x, w, h) => { x.clearRect(0, 0, w, h); x.strokeStyle = 'rgba(150,154,158,0.9)'; x.lineWidth = 0.62; for (let k = -64; k <= 128; k += 8) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + 64, 64); x.stroke(); x.beginPath(); x.moveTo(k, 64); x.lineTo(k + 64, 0); x.stroke(); } }, null, (x, w, h) => { x.fillStyle = 'rgb(110,110,110)'; x.fillRect(0, 0, w, h); }, 'uv');
      const tec = AT.region('tecpro', 128, 96, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(0,0,0,0.1)'; x.fillRect(0, 0, w, 4); x.fillRect(0, h - 4, w, 4); x.fillStyle = '#1a1b1e'; x.fillRect(0, h * 0.2, w, h * 0.09); x.fillRect(0, h * 0.68, w, h * 0.09); x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = '900 18px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(30,30,30,0.85)'; x.fillText('SAFETY', w / 2, h * 0.49); weather(x, w, h, 71, 300); },
        (x, w, h) => { x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, h * 0.2, w, h * 0.09); x.fillRect(0, h * 0.68, w, h * 0.09); const g2 = x.createLinearGradient(0, 0, 0, 10); g2.addColorStop(0, 'rgb(90,90,90)'); g2.addColorStop(1, 'rgb(128,128,128)'); x.fillStyle = g2; x.fillRect(0, 0, w, 10); }, (x, w, h) => { x.fillStyle = 'rgb(160,160,160)'; x.fillRect(0, 0, w, h); }, 'none');
      const belt = AT.region('belt', 256, 64, (x, w, h) => { x.fillStyle = '#6b6e73'; x.fillRect(0, 0, w, h); const r = U.rng(9); x.fillStyle = 'rgba(255,255,255,0.1)'; for (let yy = 16; yy < h - 8; yy += 12) x.fillRect(0, yy, w, 2); x.fillStyle = 'rgba(0,0,0,0.25)'; for (let yy = 18; yy < h - 8; yy += 12) x.fillRect(0, yy, w, 1); for (let i = 0; i < 500; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.03 + r() * 0.07) + ')'; x.fillRect(r() * w, r() * h, 1 + r() * 3, 1); } x.fillStyle = '#8d9196'; for (let k = 8; k < w; k += 32) for (const yy of [8, h - 8]) { x.beginPath(); x.arc(k, yy, 2.6, 0, 6.283); x.fill(); } },
        (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(200,200,200)'; for (let k = 8; k < w; k += 32) for (const yy of [8, h - 8]) { x.beginPath(); x.arc(k, yy, 2.6, 0, 6.283); x.fill(); } }, (x, w, h) => { x.fillStyle = 'rgb(190,190,190)'; x.fillRect(0, 0, w, h); }, 'u');
      const Rm = new SKx.Batch(), Rd = new SKx.Batch(), Rf = new SKx.Batch(), Fn = new SKx.Batch(), Ln = new SKx.Lines();
      // rail profile: three W-beams stacked from 0.1 m to 1.03 m, [height, protrusion towards the road]
      const prof = []; for (let b = 0; b < 3; b++) { const yb = 0.1 + b * 0.31; for (const [dy, d] of [[0, 0], [0.075, 0.055], [0.155, 0.018], [0.235, 0.055]]) prof.push([yb + dy, d]); } prof.push([0.1 + 3 * 0.31, 0]); prof.push([1.03, -0.06]);
      const K = prof.length;
      const tecBlue = lin(0x1d4f9c), post = lin(this.data.street ? 0x4c5257 : 0x7d8389), postD = lin(this.data.street ? 0x3e4348 : 0x5d6267), railPost = lin(0x9ea4a8), cable = lin(0x3a3d40), white = lin(0xf0f0ee), red = lin(0xc8162b), dark = lin(0x1a1a1c), orange = lin(0xf08a1a), gateC = lin(0xe8a21a);
      let railTris = 0;
      for (const side of [-1, 1]) {
        const z = Z[side], wall = side < 0 ? this.wallL : this.wallR; const base = (ii) => wall[ii] + z.back[ii];
        const railOn = (ii) => !z.gap[ii] && !z.island[ii]; const fenceOn = (ii) => railOn(ii) && !inTunnel(ii);
        const cap = (ii, l) => { const kf = this.kFold[ii], c = Math.max(2, 0.9 / (Math.abs(kf) + 1e-6)); return kf > 0 ? Math.min(l, c) : Math.max(l, -c); };
        const P = (ii, d, y) => { const l = cap(ii, side * d); return [this.x[ii] + this.nx[ii] * l, this.y[ii] + y, this.z[ii] + this.nz[ii] * l]; };
        // adaptive samples along the rail line: every 2 m in bends, up to 8 m on straights; breaks where the rail stops
        const runs = []; let cur = null, lastH = 0, lastS = -1e9;
        for (let i = 0; i <= n; i++) { const ii = i % n; if (!railOn(ii)) { if (cur && cur.length > 1) runs.push(cur); cur = null; continue; }
          const h = this.heading[ii]; let dh = Math.abs(h - lastH); if (dh > Math.PI) dh = 2 * Math.PI - dh; const s = i * ds;
          const nextOff = !railOn((ii + 1) % n) || i === n;
          if (!cur) { cur = [ii]; lastH = h; lastS = s; } else if (dh > 0.03 || s - lastS >= 8 || nextOff || Math.abs(z.back[ii] - z.back[cur[cur.length - 1]]) > 0.05) { cur.push(ii); lastH = h; lastS = s; } }
        if (cur && cur.length > 1) runs.push(cur);
        for (const run of runs) {
          // arc length along the rail line for the texture (bolts every 2 m)
          const arc = [0]; for (let k = 1; k < run.length; k++) { const a = P(run[k - 1], base(run[k - 1]), 0), b = P(run[k], base(run[k]), 0); arc.push(arc[k - 1] + Math.hypot(b[0] - a[0], b[2] - a[2])); }
          const col = (k) => { const ii = run[k]; const out = [], nr = []; for (let c = 0; c < K; c++) out.push(P(ii, base(ii) - prof[c][1], prof[c][0]));
            for (let c = 0; c < K; c++) { const a = prof[Math.min(K - 1, c + 1)], b = prof[Math.max(0, c - 1)]; const dq = a[1] - b[1], dy = a[0] - b[0]; let qn = dy, yn = -dq; const l = Math.hypot(qn, yn) || 1; qn /= l; yn /= l; if (c === K - 1) { qn = 0; yn = 1; }
              nr.push([-side * this.nx[ii] * qn, yn, -side * this.nz[ii] * qn]); } return [out, nr]; };
          let prev = col(0);
          Rm.set(rail, 0.36, 0.75);
          for (let k = 1; k < run.length; k++) {
            const curC = col(k); const v0 = arc[k - 1] / 4, v1 = arc[k] / 4;
            for (let c = 0; c < K - 1; c++) {
              const a = prev[0][c], b = curC[0][c], cc = curC[0][c + 1], d = prev[0][c + 1]; const uA = prof[c][0] / 1.15, uB = prof[c + 1][0] / 1.15; const tone = c >= K - 2 ? lin(0xb9bdc0) : white;
              const uvs1 = [uA, v0, uA, v1, uB, v1], uvs2 = [uA, v0, uB, v1, uB, v0];
              if (side > 0) { Rm.triN(a, b, cc, prev[1][c], curC[1][c], curC[1][c + 1], tone, tone, tone, uvs1); Rm.triN(a, cc, d, prev[1][c], curC[1][c + 1], prev[1][c + 1], tone, tone, tone, uvs2); }
              else { Rm.triN(a, cc, b, prev[1][c], curC[1][c + 1], curC[1][c], tone, tone, tone, [uA, v0, uB, v1, uA, v1]); Rm.triN(a, d, cc, prev[1][c], prev[1][c + 1], curC[1][c + 1], tone, tone, tone, [uA, v0, uB, v0, uB, v1]); }
              railTris += 2;
            }
            // plain back face (seen from the pavements, the stands and the harbour)
            const ia = run[k - 1], ib = run[k]; const ba = [P(ia, base(ia) + 0.06, 0.1), P(ib, base(ib) + 0.06, 0.1), P(ib, base(ib) + 0.06, 1.03), P(ia, base(ia) + 0.06, 1.03)];
            Rm.set('white', 0.5, 0.6); if (side > 0) Rm.quad(ba[1], ba[0], ba[3], ba[2], lin(0x8d9397)); else Rm.quad(ba[0], ba[1], ba[2], ba[3], lin(0x8d9397)); Rm.set(rail, 0.36, 0.75);
            prev = curC;
          }
          // posts behind the rails every 2 m of rail (fine layer), a C-section with a block-out
          let next = 1; for (let k = 1; k < run.length; k++) { while (next < arc[k]) { const f = (next - arc[k - 1]) / Math.max(0.01, arc[k] - arc[k - 1]); const ia = run[k - 1], ib = run[k]; const pa = P(ia, base(ia) + 0.16, 0), pb = P(ib, base(ib) + 0.16, 0); const q = [pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f, pa[2] + (pb[2] - pa[2]) * f];
            const m = EI.Env.frame(q[0], q[1], q[2], this.tx[ia], this.tz[ia], this.nx[ia] * side, this.nz[ia] * side); Rf.set('white', 0.5, 0.6); Rf.box(m, 0.15, 1.08, 0.1, 0, 0, 0, railPost); Rf.box(m, 0.1, 0.18, 0.14, 0, 0.7, -0.1, railPost); next += 2; } }
          // sleeves where the data lists them: boards read left to right from the road
          // each contiguous cover holds a whole number of 4 m boards, centred, so no board is cut at its ends (f1-BRAND)
          const lerp3 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
          for (let k0 = 1; k0 < run.length;) {
            const kk = z.cover[run[k0 - 1]]; if (kk < 0 || z.cover[run[k0]] < 0) { k0++; continue; }
            let k1 = k0; while (k1 + 1 < run.length && z.cover[run[k1]] === kk && z.cover[run[k1 + 1]] >= 0) k1++;
            const nbd = Math.floor((arc[k1] - arc[k0 - 1]) / 4), cs0 = arc[k0 - 1] + (arc[k1] - arc[k0 - 1] - nbd * 4) / 2, cs1 = cs0 + nbd * 4;
            if (nbd >= 1) for (let k = k0; k <= k1; k++) {
              const ia = run[k - 1], ib = run[k], da = Math.max(1e-6, arc[k] - arc[k - 1]); const t0 = Math.max(0, (cs0 - arc[k - 1]) / da), t1 = Math.min(1, (cs1 - arc[k - 1]) / da); if (t1 <= t0) continue;
              const a0 = P(ia, base(ia) - 0.068, 0.12), b0 = P(ib, base(ib) - 0.068, 0.12), c0 = P(ib, base(ib) - 0.068, 1.0), d0 = P(ia, base(ia) - 0.068, 1.0);
              const a = lerp3(a0, b0, t0), b = lerp3(a0, b0, t1), c = lerp3(d0, c0, t1), d = lerp3(d0, c0, t0); const u0 = side * (arc[k - 1] + da * t0 - cs0) / 8, u1 = side * (arc[k - 1] + da * t1 - cs0) / 8;
              Rm.set(sleeves[kk % sleeves.length], 0.5, 0.0); if (side > 0) Rm.quad(a, b, c, d, white, [u0, 0, u1, 0, u1, 1, u0, 1]); else Rm.quad(a, d, c, b, white, [u0, 0, u0, 1, u1, 1, u1, 0]);
            }
            k0 = k1 + 1;
          }
        }
        // ---- debris fence: chain-link to 3.5 m behind the rail, the catch section leaning 0.75 m over the road; posts every ~4 m
        // wire tone: dark enough that the mesh reads as galvanised wire against the sky and the facades, not as a frosted sheet
        const fC = lin(0x3e4347); const fl = (ii) => base(ii) + 0.34; let fprev = null, last = null, prevPost = null, sinceGate = 60;
        const fRuns = []; let fc = null; for (let i = 0; i <= n; i++) { const ii = i % n; if (!fenceOn(ii)) { if (fc && fc.length > 1) fRuns.push(fc); fc = null; continue; } if (!fc) fc = []; if (i % 2 === 0 || !fenceOn((ii + 1) % n)) fc.push(ii); } if (fc && fc.length > 1) fRuns.push(fc);
        for (const run of fRuns) {
          let acc = 0; fprev = null;
          for (let k = 0; k < run.length; k++) { const ii = run[k]; const lo = P(ii, fl(ii), 0), up = P(ii, fl(ii), 3.5), arm = P(ii, fl(ii) - 0.75, 4.35);
            if (fprev) { acc += Math.hypot(lo[0] - fprev.lo[0], lo[2] - fprev.lo[2]); const v0 = fprev.acc / 0.5, v1 = acc / 0.5; Fn.set(chain, 0.9, 0.0); Fn.quad(fprev.lo, lo, up, fprev.up, fC, [0, v0, 0, v1, 7, v1, 7, v0]); Fn.quad(fprev.up, up, arm, fprev.arm, fC, [0, v0, 0, v1, 2.3, v1, 2.3, v0]); }
            fprev = { lo, up, arm, acc }; }
        }
        for (let i = 0; i < n; i++) {
          if (!fenceOn(i)) { prevPost = null; continue; }
          const a = P(i, fl(i) + 0.06, 0); if (last && Math.hypot(a[0] - last[0], a[2] - last[2]) < 4.0) continue; last = a;
          const top = P(i, fl(i) + 0.06, 3.55), arm = P(i, fl(i) + 0.06 - 0.8, 4.42);
          Rd.set('white', 0.45, 0.6); Rd.beam(I4, a, top, 0.11, post); Rd.beam(I4, top, arm, 0.09, post);
          if ((i & 3) === 0) Rd.beam(I4, P(i, fl(i) + 0.1, 2.4), P(i, fl(i) + 1.6, 0), 0.07, postD);
          if (prevPost) for (const h of [1.25, 2.35, 3.4]) Ln.seg([prevPost[0], prevPost[1] + h, prevPost[2]], [a[0], a[1] + h, a[2]], cable);
          if (prevPost) Ln.seg(P(i, fl(i) - 0.74, 4.4), prevPost.arm, cable);
          prevPost = a; prevPost.arm = arm;
          // marshal gates in the fence on the outside of the lap every ~110 m: a framed door with a yellow band
          sinceGate += 4; if (sinceGate > 110 && i % 3 === 0) { sinceGate = 0; const m = EI.Env.frame(a[0], a[1], a[2], this.tx[i], this.tz[i], this.nx[i] * side, this.nz[i] * side);
            Rd.set('white', 0.5, 0.5); Rd.box(m, 0.12, 2.3, 0.12, -0.6, 0, 0.02, gateC); Rd.box(m, 0.12, 2.3, 0.12, 1.6, 0, 0.02, gateC); Rd.box(m, 2.32, 0.12, 0.12, 0.5, 2.3, 0.02, gateC); Rd.box(m, 2.2, 0.06, 0.06, 0.5, 1.15, 0.02, lin(0x7d8389)); Rd.beam(m, [-0.55, 0.1, 0.02], [1.55, 2.2, 0.02], 0.05, lin(0x7d8389)); }
        }
        // ---- partner boards hung on the debris fence above the block barriers at the corners: 4 m x 1 m panels, a plain grey back
        { let a = null, kb = side > 0 ? 0 : 2; for (let i = 0; i <= n; i++) { const ii = i % n; if (!z.tec[ii] || !fenceOn(ii)) { a = null; continue; } const p = P(ii, fl(ii) - 0.05, 1.45); if (!a) { a = [ii, p]; continue; } if (Math.hypot(p[0] - a[1][0], p[2] - a[1][2]) < 4.1) continue;
          const ia = a[0], A0 = a[1], B0 = p, B1 = P(ii, fl(ii) - 0.05, 2.45), A1 = P(ia, fl(ia) - 0.05, 2.45); Rd.set(sleeves[kb++ % sleeves.length], 0.5, 0);
          // a 4 x 1 m panel shows one 4 x 0.88 m sleeve half: the middle 88 % of its height keeps the design's aspect (f1-BRAND)
          if (side > 0) Rd.quad(A0, B0, B1, A1, white, [0, 0.06, 0.5, 0.06, 0.5, 0.94, 0, 0.94]); else Rd.quad(A0, A1, B1, B0, white, [0.5, 0.06, 0.5, 0.94, 0, 0.94, 0, 0.06]);
          Rd.set('white', 0.6, 0.2); if (side > 0) Rd.quad(B0, A0, A1, B1, lin(0x6d7276)); else Rd.quad(A0, B0, B1, A1, lin(0x6d7276)); a = [ii, p]; } }
        // ---- pit road openings: orange foam end blocks and red / white marker poles
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (railOn(i) === railOn(j)) continue; const k = railOn(i) ? i : j; const c = P(k, base(k) - 0.3, 0); const m = EI.Env.frame(c[0], c[1], c[2], this.tx[k], this.tz[k], this.nx[k], this.nz[k]); Rd.set('white', 0.7, 0); Rd.box(m, 1.2, 1.15, 0.6, 0, 0, 0, orange); Rd.box(m, 1.22, 0.1, 0.62, 0, 0.75, 0, dark); const q = P(k, base(k) + 0.6, 0); for (let h = 0; h < 1.6; h += 0.4) Rd.beam(I4, [q[0], q[1] + h, q[2]], [q[0], q[1] + h + 0.4, q[2]], 0.09, h % 0.8 < 0.2 ? red : white); }
        // ---- TecPro blocks (red / white, two straps, chamfered top), stepped at 0.25 m along the lap so the modules close up
        const Ps = (s, dOff, y) => { const f = U.mod(s / ds, n); const i = Math.floor(f) % n, j = (i + 1) % n, u = f - i; const d = U.lerp(wall[i], wall[j], u) + dOff; const l = cap(i, side * d); return [U.lerp(this.x[i], this.x[j], u) + this.nx[i] * l, U.lerp(this.y[i], this.y[j], u) + y, U.lerp(this.z[i], this.z[j], u) + this.nz[i] * l, i]; };
        let lb = null, cnt = 0;
        for (let s = 0; s < L; s += 0.25) {
          const i = Math.floor(s / ds) % n; if (!z.tec[i] || z.gap[i]) { lb = null; continue; } const a = Ps(s, 0.42, 0); if (lb && Math.hypot(a[0] - lb[0], a[2] - lb[2]) < 1.5) continue; lb = a;
          const m = EI.Env.frame(a[0], a[1], a[2], this.tx[i], this.tz[i], this.nx[i] * side, this.nz[i] * side); const ci = cnt++ % 3, col = ci === 1 ? white : ci === 2 ? tecBlue : red; const P2 = (x, y, zz) => EI.Env.xf(m, x, y, zz);   // red / white / blue modules (Monaco photos)
          // body: front face textured (logo band and straps), chamfered top edge towards the road, sides and back plain
          Rd.set(tec, 0.62, 0.0); Rd.quad(P2(-0.72, 0.02, -0.38), P2(-0.72, 0.86, -0.38), P2(0.72, 0.86, -0.38), P2(0.72, 0.02, -0.38), col, [0, 0, 0, 0.88, 1, 0.88, 1, 0]);
          Rd.set('white', 0.62, 0.0); Rd.quad(P2(-0.72, 0.86, -0.38), P2(-0.72, 0.98, -0.26), P2(0.72, 0.98, -0.26), P2(0.72, 0.86, -0.38), col); Rd.quad(P2(-0.72, 0.98, -0.26), P2(-0.72, 0.98, 0.38), P2(0.72, 0.98, 0.38), P2(0.72, 0.98, -0.26), col);
          for (const sx of [-0.72, 0.72]) { const f = sx < 0 ? 1 : -1; const q = [P2(sx, 0.02, -0.38), P2(sx, 0.86, -0.38), P2(sx, 0.98, -0.26), P2(sx, 0.98, 0.38), P2(sx, 0.02, 0.38)]; if (f > 0) { Rd.tri(q[0], q[4], q[1], col); Rd.tri(q[1], q[4], q[2], col); Rd.tri(q[2], q[4], q[3], col); } else { Rd.tri(q[0], q[1], q[4], col); Rd.tri(q[1], q[2], q[4], col); Rd.tri(q[2], q[3], q[4], col); } }
          Rd.quad(P2(0.72, 0.02, 0.38), P2(0.72, 0.98, 0.38), P2(-0.72, 0.98, 0.38), P2(-0.72, 0.02, 0.38), col);
          // connecting pins on top
          Rd.set('white', 0.4, 0.7); Rd.box(m, 0.1, 0.05, 0.1, 0.72, 0.98, 0, lin(0x8c9196));
        }
        // ---- tyre walls: stacks of four behind a bolted conveyor belt facing the road; the top tyres stay visible
        lb = null; cnt = 0; let beltPrev = null;
        for (let s = 0; s < L; s += 0.25) {
          const i = Math.floor(s / ds) % n; if (!z.tyre[i] || z.gap[i] || z.tec[i]) { lb = null; beltPrev = null; continue; } const a = Ps(s, 0.36, 0); if (lb && Math.hypot(a[0] - lb[0], a[2] - lb[2]) < 0.66) continue; lb = a;
          const col = (Math.floor(cnt++ / 2) & 1) ? white : red; Rd.set('white', 0.85, 0);
          for (let k = 0; k < 8; k++) { const a0 = k / 8 * 6.283, a1 = (k + 1) / 8 * 6.283; const p0 = [a[0] + Math.cos(a0) * 0.33, a[1] + 0.76, a[2] + Math.sin(a0) * 0.33], p1 = [a[0] + Math.cos(a1) * 0.33, a[1] + 0.76, a[2] + Math.sin(a1) * 0.33];
            Rd.quad([p0[0], p0[1] + 0.22, p0[2]], [p1[0], p1[1] + 0.22, p1[2]], p1, p0, col); Rd.tri([a[0], a[1] + 0.98, a[2]], [a[0] + Math.cos(a1) * 0.33, a[1] + 0.98, a[2] + Math.sin(a1) * 0.33], [a[0] + Math.cos(a0) * 0.33, a[1] + 0.98, a[2] + Math.sin(a0) * 0.33], dark); }
          const bq = Ps(s, 0.0, 0); if (beltPrev) { const u0 = beltPrev[3], u1 = u0 + Math.hypot(bq[0] - beltPrev[0], bq[2] - beltPrev[2]) / 2; Rd.set(belt, 0.8, 0.0); const A = [beltPrev[0], beltPrev[1] + 0.02, beltPrev[2]], Bq = [bq[0], bq[1] + 0.02, bq[2]], Cq = [bq[0], bq[1] + 0.84, bq[2]], D = [beltPrev[0], beltPrev[1] + 0.84, beltPrev[2]]; if (side > 0) Rd.quad(A, Bq, Cq, D, white, [u0, 0, u1, 0, u1, 1, u0, 1]); else Rd.quad(A, D, Cq, Bq, white, [u0, 0, u0, 1, u1, 1, u1, 0]); bq[3] = u1; } else bq[3] = 0;
          beltPrev = bq;
        }
      }
      W.add(Rm, 'main'); W.add(Rd, 'detail'); W.add(Rf, 'fine'); W.add(Fn, 'fence'); W.add(Ln, 'lines');
      this.streetStats = { railTris, barrierMainTris: Rm.count / 3, barrierDetailTris: Rd.count / 3, barrierFineTris: Rf.count / 3, fenceTris: Fn.count / 3, cables: Ln.count };
    }

    buildPitLane(g) {
      const pts = this.data.pit.map(p => new THREE.Vector3(p[0], 0, p[1])); if (pts.length < 3) return;
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); curve.arcLengthDivisions = 4000;
      const len = curve.getLength(); const n = Math.max(8, Math.round(len / 2)); const sp = curve.getSpacedPoints(n); const seg = len / n;
      const hw = this.halfWidth, W = 5.5; const T = this.surfaceTextures();
      // frames along the lane: left normal, ground height, distance of each lane edge from the track centre line
      const F = []; const pr = {};
      for (let i = 0; i <= n; i++) {
        const a = sp[Math.max(0, i - 1)], b = sp[Math.min(n, i + 1)]; let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        this.project(sp[i].x, sp[i].z, null, pr); const nx = dz, nz = -dx;
        const edge = (o) => { const q = this.project(sp[i].x + nx * o, sp[i].z + nz * o, pr.i, {}); return q.dist; };
        F.push({ x: sp[i].x, z: sp[i].z, nx, nz, y: this.y[pr.i], dL: edge(W), dR: edge(-W), dC: pr.dist });
      }
      const pos = [], idx = [], uv = [];
      for (let i = 0; i <= n; i++) { const f = F[i]; pos.push(f.x - f.nx * W, f.y + 0.004, f.z - f.nz * W, f.x + f.nx * W, f.y + 0.004, f.z + f.nz * W); uv.push(-W / 5, i * seg / 5, W / 5, i * seg / 5); }
      for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
      const nr = new Float32Array(pos.length); for (let i = 1; i < nr.length; i += 3) nr[i] = 1; geo.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
      // the lane only shows where it leaves the racing surface (no pit asphalt painted over the track itself)
      const vis = F.map(f => Math.min(f.dL, f.dR) > hw - 0.3);
      const idx2 = []; for (let i = 0; i < n; i++) if (vis[i] || vis[i + 1]) { const a = i * 2; idx2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } geo.setIndex(idx2);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: T.asphalt.map, normalMap: T.asphalt.normalMap, roughnessMap: T.asphalt.roughnessMap, color: this.data.street ? 0xe0a08c : this.data.pitColor != null ? this.data.pitColor : 0xdedcd8, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));   // data.pitColor (COTA): the pit lane's asphalt tint (the racing surface's shader is darker than the plain map)
      m.receiveShadow = true; m.name = 'pitLane'; g.add(m);
      // markings in one batch: lane edge lines, dashed centre, pit entry / exit lines (thicker, on the track-side edge while the lane runs beside the track),
      // and the speed-limit lines with painted "PIT" / "80"
      const b = { pos: [], uv: [], idx: [] }; const tb = { pos: [], uv: [], idx: [] };
      const band = (B, i0, i1, o0, o1, uvf) => { const base = B.pos.length / 3; for (let i = i0; i <= i1; i++) { const f = F[i]; for (const [c, o] of [[0, o0], [1, o1]]) { B.pos.push(f.x + f.nx * o, f.y + 0.014, f.z + f.nz * o); const t = uvf ? uvf((i - i0) / Math.max(1, i1 - i0), c) : [0.5, 0.5]; B.uv.push(t[0], t[1]); } if (i > i0) { const a = base + (i - 1 - i0) * 2, q = a + 2; B.idx.push(a, q, a + 1, a + 1, q, q + 1); } } };
      const trackSideLeft = (i) => F[i].dL < F[i].dR;
      for (let i = 0; i < n; i++) {
        if (!vis[i] && !vis[i + 1]) continue;
        band(b, i, i + 1, W - 0.3, W - 0.15); band(b, i, i + 1, -W + 0.15, -W + 0.3);
        if (i % 3 === 0) band(b, i, i + 1, -0.07, 0.07);
      }
      // pit entry / exit line: 0.3 m solid line from the track edge along the lane's track-side edge until the lane is clear of the track
      for (const [from, dir] of [[0, 1], [n, -1]]) {
        let i = from; while (i >= 0 && i <= n && Math.min(F[i].dL, F[i].dR) < hw + 0.3) i += dir; const start = i;
        while (i >= 0 && i <= n && Math.min(F[i].dL, F[i].dR) < hw + 14 && Math.abs(i - start) < 90) i += dir;
        const a = Math.max(0, Math.min(start, i)), c = Math.min(n, Math.max(start, i)); if (c - a < 2) continue;
        for (let k = a; k < c; k++) { const o = trackSideLeft(k) ? 1 : -1; band(b, k, k + 1, o > 0 ? W - 0.32 : -W + 0.02, o > 0 ? W - 0.02 : -W + 0.32); }
        // speed limit line across the lane ~25 m after the lane separates, "PIT" and "80" painted beyond it
        const lim = U.clamp(i + dir * 12, 2, n - 2); const l0 = Math.min(lim, lim + dir), l1 = Math.max(lim, lim + dir);
        const f0 = F[l0], f1 = F[l1]; const yy = (f0.y + f1.y) / 2 + 0.014;
        const mid = (u) => ({ x: U.lerp(f0.x, f1.x, u), z: U.lerp(f0.z, f1.z, u), nx: f0.nx, nz: f0.nz });
        const quad = (B, u0, u1, o0, o1, uvRect) => { const p0 = mid(u0), p1 = mid(u1); const base = B.pos.length / 3;
          for (const [p, v] of [[p0, 0], [p1, 1]]) for (const [o, c] of [[o0, 0], [o1, 1]]) { B.pos.push(p.x + p.nx * o, yy, p.z + p.nz * o); const vv = v; B.uv.push(uvRect[0] + (uvRect[2] - uvRect[0]) * (1 - c), uvRect[1] + (uvRect[3] - uvRect[1]) * vv); }
          B.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3); };
        quad(b, 0.45, 0.55, -W + 0.15, W - 0.15, [0.5, 0.5, 0.5, 0.5]);
        // text reads for a car travelling in the lane direction (entry: forwards along the curve, exit: same)
        if (dir > 0) { quad(tb, 0.65, 2.3, -2.6, 2.6, [0, 0.5, 1, 1]); quad(tb, 2.6, 4.0, -2.0, 2.0, [0, 0, 1, 0.5]); }
        else { quad(tb, -3.8, -2.15, -2.6, 2.6, [0, 0.5, 1, 1]); quad(tb, -1.85, -0.45, -2.0, 2.0, [0, 0, 1, 0.5]); }
      }
      // street circuits (Monaco: pit1 / pitlane_a): a red-brown lane with yellow lines
      const white = U.srgb(solidTexture(this.data.street ? '#f2c41c' : '#ecebe6'));
      const mk = Track.batchMesh(b, new THREE.MeshStandardMaterial({ map: white, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); mk.name = 'pitMarkings'; g.add(mk);
      if (tb.idx.length) { const tx = U.srgb(pitTextTexture()); const mt = Track.batchMesh(tb, new THREE.MeshStandardMaterial({ map: tx, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); mt.name = 'pitText'; g.add(mt); }
      this.pitCurve = curve;
    }

    // trackside furniture atlas (2048 x 2048): 16 corner-name boards (1024 x 176), the start gantry banner, the sponsor bridge faces,
    // DRS / DRS-detection / braking boards and a few solid colour cells for posts, backs, bridge beams and lamp housings
    boardAtlas() {
      const S = 2048; const c = document.createElement('canvas'); c.width = c.height = S; const ctx = c.getContext('2d');
      ctx.fillStyle = '#2b2f36'; ctx.fillRect(0, 0, S, S);
      const R = {}; const cell = (key, x, y, w, h, draw) => { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); draw(ctx, w, h); ctx.restore(); R[key] = { x, y, w, h }; };
      const TURN = { 'Abbey': 1, 'Farm Curve': 2, 'Village': 3, 'The Loop': 4, 'Aintree': 5, 'Brooklands': 6, 'Luffield': 7, 'Woodcote': 8, 'Copse': 9, 'Maggotts': 10, 'Becketts': 11, 'Chapel Curve': 13, 'Stowe': 15, 'Vale': 16, 'Club': 18 };
      const hasT = this.data.corners.some(c => c.t != null); const turnOf = (name) => { const c = this.data.corners.find(cc => cc.name === name); return c && c.t != null ? c.t : (TURN[name] || ''); };
      const names = []; for (const cn of this.data.corners) if (!/Straight/i.test(cn.name) && (!hasT || cn.t != null) && names.indexOf(cn.name) < 0) names.push(cn.name);
      names.slice(0, 16).forEach((name, k) => cell('corner:' + name, (k % 2) * 1024, Math.floor(k / 2) * 176, 1024, 176, (ctx, w, h) => {
        ctx.fillStyle = '#0d3a2b'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#c8102e'; ctx.fillRect(0, h * 0.86, w, h * 0.14); ctx.fillStyle = '#e8e3d0'; ctx.fillRect(0, 0, w, h * 0.04);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(h * 0.48, h * 0.46, h * 0.3, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#0d3a2b'; ctx.font = '900 ' + Math.round(h * 0.34) + 'px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(turnOf(name)), h * 0.48, h * 0.48);
        ctx.fillStyle = '#ffffff'; ctx.font = 'italic 900 ' + Math.round(h * 0.46) + 'px Arial Black, Arial'; ctx.textAlign = 'left'; ctx.fillText(name.toUpperCase(), h * 0.95, h * 0.47, w - h * 1.1);
      }));
      const text = (txt, bg, size) => (ctx, w, h) => { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.font = 'italic 900 ' + size + 'px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, w / 2, h / 2, w - 16); };
      // the start gantry banner and the sponsor bridges carry the race partners' ads (EI.Ads)
      cell('banner', 0, 1536, 2048, 96, (ctx, w, h) => EI.Ads.paintBanner(ctx, w, h));
      cell('bridge:lumi', 0, 1632, 1024, 128, (ctx, w, h) => EI.Ads.paintBridge(ctx, 'lumi', w, h));
      cell('bridge:intake', 1024, 1632, 1024, 128, (ctx, w, h) => EI.Ads.paintBridge(ctx, 'intake', w, h));
      cell('bridge:lumi2', 0, 1760, 1024, 128, (ctx, w, h) => EI.Ads.paintBridge(ctx, 'lumi2', w, h));
      cell('bridge:intake2', 0, 1408, 1024, 128, (ctx, w, h) => EI.Ads.paintBridge(ctx, 'intake2', w, h));
      cell('bridge:DRS ZONE', 1024, 1408, 1024, 128, text('DRS ZONE', '#1a73e8', 80));
      cell('drsDetect', 1024, 1760, 512, 128, (ctx, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#1a73e8'; ctx.fillRect(0, 0, w, h * 0.14); ctx.fillRect(0, h * 0.86, w, h * 0.14); ctx.fillStyle = '#111'; ctx.font = 'italic 900 62px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('DRS DETECTION', w / 2, h / 2 + 3, w - 30); });
      [[150, 0], [100, 160], [50, 320], [300, 800], [200, 960]].forEach(([d, bx]) => cell('brake:' + d, bx, 1888, 160, 160, (ctx, w, h) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#0d3a2b'; ctx.lineWidth = 9; ctx.strokeRect(4.5, 4.5, w - 9, h - 9); ctx.fillStyle = '#111'; ctx.font = '900 ' + (d > 99 ? 65 : 81) + 'px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(d), w / 2, h / 2 + 4); }));
      cell('drs', 480, 1888, 320, 160, (ctx, w, h) => { ctx.fillStyle = '#1a73e8'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.font = 'italic 900 94px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('DRS', w / 2, h / 2 + 4); });
      [['post', '#2b2f36'], ['black', '#0f1012'], ['hood', '#1a1a1c'], ['white', '#e8e8e8'], ['plum', '#5e3a5f'], ['brown', '#2b211c'], ['blue', '#1a73e8']].forEach(([k, col], j) => cell(k, 1536 + (j % 4) * 128, 1760 + Math.floor(j / 4) * 128, 128, 128, (ctx, w, h) => { ctx.fillStyle = col; ctx.fillRect(0, 0, w, h); }));
      const tex = U.srgb(canvasTex(c)); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const rect = (key) => { const r = R[key]; return atlasRect(S, S, r.x, r.y, r.w, r.h); };
      return { tex, rect };
    }

    buildFurniture(g) {
      const hw = this.halfWidth; const A = this.boardAtlas();
      // every static piece of furniture (boards, posts, gantry, bridges, light towers) shares this material; merged into one mesh later
      const mat = new THREE.MeshLambertMaterial({ map: A.tex, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: A.tex, emissiveIntensity: 0.15 });
      const uvFace = (geo, key) => { const f = A.rect(key), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) { const t = f(uv.getX(i), uv.getY(i)); uv.setXY(i, t[0], t[1]); } return geo; };
      const uvSolid = (geo, key) => { const t = A.rect(key)(0.5, 0.5), uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, t[0], t[1]); return geo; };
      const solid = (geo, key, decor) => { const m = new THREE.Mesh(uvSolid(geo, key), mat); if (decor) m.userData.decor = true; return m; };
      const placeAt = (s, side, dist) => { const i = this.idxAtS(s); const wall = side < 0 ? this.wallL[i] : this.wallR[i]; const d = dist != null ? dist : wall - 0.1; return { x: this.x[i] + this.nx[i] * side * d, y: this.y[i], z: this.z[i] + this.nz[i] * side * d, heading: this.heading[i], i }; };
      // start light gantry
      const i0 = this.idxAtS(this.sf + (this.data.furniture && this.data.furniture.startGantry != null ? this.data.furniture.startGantry : 6)); const gantry = new THREE.Group();
      for (const side of [-1, 1]) { const post = solid(new THREE.BoxGeometry(0.5, 7.5, 0.5), 'post'); post.position.set(0, 3.75, side * (hw + 1.6)); post.castShadow = true; gantry.add(post); }
      const beamLen = hw * 2 + 3.6;
      for (const [yy, zz] of [[7.0, -0.35], [7.0, 0.35], [7.8, -0.35], [7.8, 0.35]]) { const chord = solid(new THREE.BoxGeometry(0.1, 0.1, beamLen), 'post'); chord.position.set(zz, yy, 0); gantry.add(chord); }
      for (let zq = -beamLen / 2; zq <= beamLen / 2; zq += 1.2) { const diag = solid(new THREE.BoxGeometry(0.06, 1.1, 0.06), 'post', true); diag.position.set(0.35, 7.4, zq); diag.rotation.x = 0.6; gantry.add(diag); const diag2 = diag.clone(); diag2.position.x = -0.35; diag2.rotation.x = -0.6; gantry.add(diag2); const vert = solid(new THREE.BoxGeometry(0.7, 0.06, 0.06), 'post', true); vert.position.set(0, 7.0, zq); gantry.add(vert); }
      const banner = new THREE.Mesh(uvFace(new THREE.PlaneGeometry(beamLen - 1, 0.9), 'banner'), mat); banner.position.set(-0.42, 8.45, 0); banner.rotation.y = -Math.PI / 2; gantry.add(banner);
      const panel = solid(new THREE.BoxGeometry(0.5, 1.7, 6.6), 'black'); panel.position.y = 6.2; gantry.add(panel);
      for (let c = 0; c < 5; c++) for (let rr = 0; rr < 2; rr++) { const hood = solid(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14), 'hood'); hood.rotation.z = Math.PI / 2; hood.position.set(-0.3, 6.55 - rr * 0.65, (c - 2) * 1.15); gantry.add(hood); }
      // the lamps change colour at the start: kept as separate meshes (not merged)
      this.startLights = []; const offMat = new THREE.MeshBasicMaterial({ color: 0x2a0b0b });
      // every circuit: the ten lamps are one instanced draw (per-lamp colour; PERF-2: was 10 draws off the street circuits)
      {
        const lg = new THREE.SphereGeometry(0.28, 10, 8); lg.boundingSphere = new THREE.Sphere(new THREE.Vector3(-0.25, 6.2, 0), 3.0);   // covers all ten lamps (culling)
        const im = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), 10); im.name = 'startLamp'; const mm = new THREE.Matrix4(), cc = new THREE.Color(0x2a0b0b);
        for (let c = 0; c < 5; c++) for (let rr = 0; rr < 2; rr++) { mm.makeTranslation(-0.25, 6.55 - rr * 0.65, (c - 2) * 1.15); im.setMatrixAt(c * 2 + rr, mm); im.setColorAt(c * 2 + rr, cc); }
        gantry.add(im); this.startInst = im;
      }
      gantry.position.set(this.x[i0], this.y[i0], this.z[i0]); gantry.rotation.y = -this.heading[i0]; gantry.name = 'startGantry'; g.add(gantry);
      // boards face oncoming cars (toed 15 degrees towards the track); dist = lateral distance of the board centre
      const addBoard = (s, side, key, w, h, y, dist) => {
        const i = this.idxAtS(s); const p = placeAt(s, side, dist); const a = 0.26;
        const nX = -this.tx[i] * Math.cos(a) - side * this.nx[i] * Math.sin(a), nZ = -this.tz[i] * Math.cos(a) - side * this.nz[i] * Math.sin(a); const th = Math.atan2(nX, nZ);
        const m = new THREE.Mesh(uvFace(new THREE.PlaneGeometry(w, h), key), mat); m.position.set(p.x, p.y + y, p.z); m.rotation.y = th; g.add(m);
        const back = solid(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.06), 'post'); back.position.set(p.x - nX * 0.04, p.y + y, p.z - nZ * 0.04); back.rotation.y = th; g.add(back);
        const ax = Math.cos(th), az = -Math.sin(th); const posts = w > 3 ? [-w * 0.38, w * 0.38] : [0];
        for (const o of posts) { const post = solid(new THREE.BoxGeometry(0.12, y - h / 2 + 0.05, 0.12), 'post'); post.position.set(p.x + ax * o - nX * 0.1, p.y + (y - h / 2) / 2, p.z + az * o - nZ * 0.1); g.add(post); }
      };
      const wallAt = (s, side) => { const i = this.idxAtS(s); return side < 0 ? this.wallL[i] : this.wallR[i]; };
      const kk = this.smooth(this.k, 15);
      const outsideAt = (s) => (kk[this.idxAtS(s)] > 0 ? -1 : 1);
      // corner names (Silverstone style: dark green, white italic caps, turn-number badge)
      const named = {}; const hasT = this.data.corners.some(c => c.t != null);
      for (const c of this.data.corners) {
        if (/Straight/i.test(c.name) || named[c.name] || (hasT && c.t == null)) continue; named[c.name] = true;
        const sd = outsideAt(c.s + 45); addBoard(c.s + 45, sd, 'corner:' + c.name, 6.4, 1.2, 3.9, wallAt(c.s + 45, sd) + 3.8);
      }
      // braking boards: 150 / 100 / 50 m before the turn-in of the heavy stops, on the outside of the approach
      const stops = this.data.brakeStops || ['Village', 'Brooklands', 'Stowe', 'Vale', 'Club', 'Abbey', 'Luffield'];
      for (const c of this.data.corners) { const sk = '_d' + (stops.indexOf(c.name) >= 0 ? c.name : c.t); if (!this.cornerIn(stops, c) || named[sk]) continue; /* listed by name: one set per name as before; by turn number: per turn */ named[sk] = true; const side = outsideAt(c.s + 30); const BB = this.data.brakeBoards; for (const d of (BB && (BB[c.t] || BB[c.name] || BB.default)) || [150, 100, 50]) { const w = Math.max(wallAt(c.s - d - 6, side), wallAt(c.s - d, side), wallAt(c.s - d + 6, side)), room = !this.data.street && w - 1.4 >= this.halfWidth + this.kerbWidth + 2.5; addBoard(c.s - d, side, 'brake:' + d, 1.5, 1.5, room ? 1.45 : 2.05, room ? Math.min(w - 1.4, this.halfWidth + this.kerbWidth + 4) : w + 0.35); } }
      for (const z of this.drs) { const dd = (s, sd, w) => wallAt(s, sd) - 0.6 - w / 2 >= this.halfWidth + this.kerbWidth + 2 ? Math.min(wallAt(s, sd) - 0.6 - w / 2, this.halfWidth + 5 + w / 2) : wallAt(s, sd) + 0.35; addBoard(z.detect, -1, 'drsDetect', 4, 1.0, 2.3, dd(z.detect, -1, 4)); addBoard(z.start, -1, 'drs', 2.4, 1.2, 2.2, dd(z.start, -1, 2.4)); addBoard(z.start, 1, 'drs', 2.4, 1.2, 2.2, dd(z.start, 1, 2.4)); }
      // sponsor bridges
      const bridge = (s, text, beam) => {
        const i = this.idxAtS(s); const grp = new THREE.Group();
        // street circuits: the legs stand behind the barriers (a run-off widened there put them in the escape road, Ste Devote; FIT-AUDIT)
        const po = this.data.street || this.data.kerbStyle === 'spa' || this.data.kerbStyle === 'cota' ? Math.max(hw + 3, Math.max(this.wallL[i], this.wallR[i]) + 0.8) : hw + 3;   // (Spa: the legs stand behind the barriers too, never in the run-off)
        for (const side of [-1, 1]) { const post = solid(new THREE.BoxGeometry(0.8, 8, 0.8), 'post'); post.position.set(0, 4, side * po); post.castShadow = true; grp.add(post); }
        const b = solid(new THREE.BoxGeometry(1.2, 2.2, po * 2 + 1), beam); b.position.y = 8.5; b.castShadow = true; grp.add(b);
        for (const dir of [-1, 1]) { const f = new THREE.Mesh(uvFace(new THREE.PlaneGeometry(po * 2 + 0.8, 2.1), 'bridge:' + text), mat); f.position.set(dir * 0.62, 8.5, 0); f.rotation.y = dir * Math.PI / 2; grp.add(f); }
        grp.position.set(this.x[i], this.y[i], this.z[i]); grp.rotation.y = -this.heading[i]; g.add(grp);
      };
      const F = this.data.furniture || {};
      for (const [s, txt, beam] of F.bridges || [[this.sf + 140, 'lumi', 'plum'], [4650, 'intake', 'brown'], [2850, 'lumi2', 'plum'], [4850, 'intake2', 'blue'], [1600, 'DRS ZONE', 'blue']]) bridge(s, txt, beam);
      // marshal posts are built by EI.Infra (booths, flag marshals, number boards)
      // flood lights / camera towers along the straights for skyline interest (decorative)
      for (const s of F.floodlights || [500, 1500, 2600, 3300, 4500, 5400]) { const p = placeAt(s, 1, this.wallR[this.idxAtS(s)] + 4); const t = solid(new THREE.CylinderGeometry(0.25, 0.4, 18, 6), 'post', true); t.position.set(p.x, p.y + 9, p.z); g.add(t); const head = solid(new THREE.BoxGeometry(2.5, 0.8, 1.2), 'white', true); head.position.set(p.x, p.y + 18.2, p.z); head.rotation.y = -p.heading; g.add(head); }
    }

    // ---------------------------------------------------------------- draw-call batching
    // every static mesh of the group that shares a material becomes one indexed BufferGeometry (world transforms baked in). Kept apart:
    // the start-light lamps (their colour changes) and the pit lane meshes js/pit.js hides by name. Members flagged userData.decor are
    // placed at the end of their batch so setQuality('low') can drop them with a draw range.
    mergeStatic(g) {
      g.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
      const keep = new Set(); for (const col of this.startLights || []) for (const l of col) keep.add(l); if (this.startInst) keep.add(this.startInst);
      const batches = new Map(), list = [];
      g.traverse(o => {
        if (!o.isMesh || keep.has(o) || Array.isArray(o.material) || /^pit(Lane|Markings|Text)$/.test(o.name || '')) return;
        let b = batches.get(o.material); if (!b) { b = { mat: o.material, members: [] }; batches.set(o.material, b); list.push(b); } b.members.push(o);
      });
      const NAMES = { runoffLogos: 'paint' };
      this.batches = [];
      for (const b of list) {
        const ms = b.members.filter(o => !o.userData.decor).concat(b.members.filter(o => o.userData.decor));
        const items = ms.map(o => ({ geo: o.geometry, matrix: inv.clone().multiply(o.matrixWorld) }));
        const geo = U.mergeGeometries(items);
        let core = 0; for (const o of ms) if (!o.userData.decor) core += o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
        const nm = ms.map(o => o.name).find(x => x) || '';
        const m = new THREE.Mesh(geo, b.mat); m.name = NAMES[nm] || nm || (b.mat.isMeshLambertMaterial ? 'furniture' : b.mat.side === THREE.DoubleSide ? 'barriers' : 'track');
        m.castShadow = ms.some(o => o.castShadow); m.receiveShadow = ms.some(o => o.receiveShadow);
        m.userData.coreCount = core; m.userData.fullCount = geo.index.count; m.userData.castShadow = m.castShadow;
        for (const o of ms) { o.parent.remove(o); o.geometry.dispose(); }
        g.add(m); this.batches.push(m);
      }
      // drop groups that are now empty (bridges); the gantry keeps its lamps
      const empty = []; g.traverse(o => { if (o !== g && !o.isMesh && o.children.length === 0) empty.push(o); }); for (const o of empty) o.parent.remove(o);
    }

    // quality presets (main.js): 'low' drops decorative batches / members (run-off logos, gantry truss, light towers, the debris fence),
    // stops furniture casting shadows and lowers texture anisotropy; physics arrays are never touched
    setQuality(q) {
      this.quality = q; const low = q === 'low';
      if (this._shdU && this._shdU.eiShdK.value !== 0) this._shdU.eiShdK.value = low ? 1 : 2;   // street shade bake: whole lap on Low, beyond the shadow box above
      for (const m of this.batches || []) {
        const d = m.userData; m.geometry.setDrawRange(0, low ? d.coreCount : Infinity); m.visible = !(low && d.coreCount === 0);
        if (m.name === 'fence') m.visible = !low || !!(this.data.fence && this.data.fence.low);   // Monza: the catch fence is in every photo, also on Low
        if (m.name === 'furniture') m.castShadow = !low && d.castShadow;
        if (this.data.street && (m.name === 'barrierParts' || m.name === 'armco')) m.castShadow = !low;
      }
      // street circuit: the low tier drops the harbour's and the stands' shadow casters (they are lap-wide merged meshes)
      if (this.data.street && this.scenery && this.scenery.group) for (const o of this.scenery.group.children) if (/^(yachts|standSeats|tunnelShell|retainingWalls)$/.test(o.name)) { if (o.userData.cs == null) o.userData.cs = o.castShadow; o.castShadow = !low && o.userData.cs; }
      const an = low ? 2 : q === 'high' ? 8 : 4; const T = Track._tex;
      if (T) for (const k of ['asphalt', 'runoff', 'grass', 'gravel']) for (const tk of ['map', 'normalMap', 'roughnessMap']) { const t = T[k] && T[k][tk]; if (t && t.anisotropy !== an) { t.anisotropy = an; t.needsUpdate = true; } }
    }
    setStartLights(count) { if (this.startInst) { const c = new THREE.Color(); for (let k = 0; k < 10; k++) this.startInst.setColorAt(k, c.setHex((k >> 1) < count ? 0xff1a1a : 0x2a0b0b)); this.startInst.instanceColor.needsUpdate = true; return; } if (!this.startLights) return; this.startLights.forEach((col, c) => col.forEach(l => { l.material.color.setHex(c < count ? 0xff1a1a : 0x2a0b0b); })); }
  }
  EI.Track = Track;
})();
