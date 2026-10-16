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
    f: 'varying vec4 vTrk; varying vec4 vTrk2; varying vec3 vColA; varying vec3 vColB;',
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
    eCol *= mix(vec3(1.0), vec3(1.05, 1.02, 0.95), smoothstep(0.35, 0.75, eM2.r));
    float eLane = floor((eLat + eiHW) / (2.0 * eiHW / 3.0));
    eCol *= 0.965 + 0.07 * eiHash(vec2(eLane, 7.0));
    float eSeg = floor(eS / 34.0); float eh = eiHash(vec2(eSeg, 3.1)); float ePatch = 0.0, eSeam = 0.0;
    if (eh > 0.62) {
      float pc = (eiHash(vec2(eSeg, 9.7)) - 0.5) * eiHW * 1.3; float pw = 0.9 + eiHash(vec2(eSeg, 1.3)) * 2.8;
      float ps0 = eSeg * 34.0 + eiHash(vec2(eSeg, 5.5)) * 10.0; float ps1 = ps0 + 5.0 + eiHash(vec2(eSeg, 2.2)) * 18.0;
      ePatch = eiBox(eLat, pc - pw * 0.5, pc + pw * 0.5, eAA) * eiBox(eS, ps0, ps1, eAS);
      eSeam = eiBox(eLat, pc - pw * 0.5 - 0.06, pc + pw * 0.5 + 0.06, eAA) * eiBox(eS, ps0 - 0.06, ps1 + 0.06, eAS) - ePatch;
    }
    eCol = mix(eCol, mix(eCol, vec3(dot(eCol, vec3(0.33))), 0.6) * vec3(0.84, 0.84, 0.86) * (0.95 + 0.1 * eM2.r), ePatch);
    eCol *= 1.0 - 0.5 * eSeam;
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
    diffuseColor.rgb = eCol;
  `;
  const ASPHALT_ROUGH = `
    roughnessFactor = clamp(roughnessFactor * (1.0 - 0.38 * eRubber) + eDirtA * 0.2, 0.3, 1.0);
    roughnessFactor = mix(roughnessFactor, 0.55, ePaint);
    float eiFlat = clamp(ePaint * 0.85 + eRubber * 0.55 + ePatch * 0.35, 0.0, 1.0);
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
    vec3 rGreenC = vec3(0.045, 0.2, 0.06) * (0.85 + 0.3 * rM2.r);
    float rWear = smoothstep(0.5, 0.85, rM2.r) * 0.55 + rCr * 0.5;
    vec4 rTy = texture2D(eiAux, vec2((rAl * 0.9 - rS * 0.22) * 0.09, rS * eiSP.w * 0.5));
    float rTyre = smoothstep(0.62, 0.8, rTy.g) * (1.0 - smoothstep(aw0, aw0 + 9.0, rAl));
    rCol = mix(rCol, rGreenC * (1.0 - 0.25 * rWear), rGreen);
    float pat = vTrk.w; float useB = 0.0; float wl = 0.0; float P = 5.0; float q = 0.0;
    if (pat < 0.5) { useB = smoothstep(aw0 + 3.2 - rAA, aw0 + 3.2 + rAA, rAl); wl = 1.0 - smoothstep(0.09, 0.09 + rAA, abs(rAl - aw0 - 3.2)); }
    else { if (pat < 1.5) { P = 6.0; q = (rS * 0.7071 + rAl * 0.7071) / P; } else { P = 12.0; q = rS / P; }
      float qa = max(fwidth(q) * P, 0.002); float qf = fract(q * 2.0); float bd = min(qf, 1.0 - qf) * P * 0.5;
      useB = step(0.5, fract(q)); wl = 1.0 - smoothstep(0.08, 0.08 + qa, bd); }
    float rIn = smoothstep(aw0 - rAA, aw0 + rAA, rAl) * (1.0 - smoothstep(rOuter - 0.35 - rAA, rOuter - 0.35 + rAA, rAl));
    float rMask = rPon * rIn;
    float rEdgeW = (1.0 - smoothstep(0.08, 0.08 + rAA, abs(rAl - aw0 - 0.1))) + (1.0 - smoothstep(0.1, 0.1 + rAA, abs(rAl - rOuter + 0.5)));
    float rEnd = 1.0 - smoothstep(0.06, 0.12, abs(vTrk.z - 0.5) * 2.0);
    wl = clamp(wl + rEdgeW + rEnd * step(aw0, rAl), 0.0, 1.0);
    vec3 rPaint = mix(vColA, vColB, useB) * (0.88 + 0.22 * rM1.g);
    rPaint = mix(rPaint, vec3(0.72, 0.72, 0.7), wl);
    rPaint = mix(rPaint, rBase * 1.05, clamp(rWear * 0.75, 0.0, 0.8));
    rCol = mix(rCol, rPaint, rMask * (rPon > 0.0 ? 1.0 : 0.0));
    rCol = mix(rCol, rCol * 0.45, rTyre * 0.55 * rPon);
    vec4 rSp = texture2D(eiAux, vec2(rLat * 0.55, rS * eiSP.y * 6.0));
    float rSpill = (1.0 - smoothstep(0.0, 1.6, rGS - rAl)) * step(rAl, rGS + 0.2) * step(0.3, rSp.b);
    rCol = mix(rCol, vec3(0.30, 0.27, 0.225) * (0.8 + 0.4 * rSp.r), rSpill * 0.85);
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
  function canvasTex(c, wrap) { const t = new THREE.CanvasTexture(c); if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
  // kerb: x = across (0 at the track edge), y = along; one tile = one red + one white block with slanted (sawtooth) joints
  function kerbTexture() {
    const W = 256, H = 512; const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    ctx.fillStyle = '#ece9e1'; ctx.fillRect(0, 0, W, H);
    const slant = H * 0.07; const joint = (y0) => [[0, y0 - slant], [W, y0 + slant]];
    ctx.fillStyle = '#c8141e';
    for (const off of [-H, 0, H]) { const a = joint(off), b = joint(off + H / 2); ctx.beginPath(); ctx.moveTo(a[0][0], a[0][1]); ctx.lineTo(a[1][0], a[1][1]); ctx.lineTo(b[1][0], b[1][1]); ctx.lineTo(b[0][0], b[0][1]); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = 'rgba(25,10,10,0.55)'; ctx.lineWidth = 3;
    for (const off of [-H, -H / 2, 0, H / 2, H]) { const a = joint(off); ctx.beginPath(); ctx.moveTo(a[0][0], a[0][1]); ctx.lineTo(a[1][0], a[1][1]); ctx.stroke(); }
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
  // painted markings atlas (2048 x 1024, transparent ground): grid slots (5 x 4 cells: number ahead of the front line, bracket going back),
  // four rows of run-off paint logos (the race partners), the start / finish chequer band and a solid white cell for plain lines
  function paintAtlas() {
    const W = 2048, H = 1024; const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, W, H);
    const cw = 204.8, ch = 256;
    for (let p = 0; p < 20; p++) {
      const x0 = (p % 5) * cw, y0 = Math.floor(p / 5) * ch; ctx.fillStyle = '#efeeea';
      const fy = y0 + ch * 0.306; ctx.fillRect(x0 + cw * 0.06, fy, cw * 0.88, 7); ctx.fillRect(x0 + cw * 0.06, fy, 6, 80); ctx.fillRect(x0 + cw * 0.94 - 6, fy, 6, 80);
      ctx.font = 'italic 900 64px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p + 1), x0 + cw / 2, y0 + ch * 0.16);
    }
    weather(ctx, 1024, 1024, 77, 9000, 0, 0);
    for (let k = 0; k < 4; k++) EI.Ads.paintRunoff(ctx, k, 1024, k * 128, 1024, 128, '#f2f1ec');
    weather(ctx, 1024, 512, 91, 26000, 1024, 0);
    const q = 21; for (let i = 0; i < 48; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#e9e8e3' : '#151517'; ctx.fillRect(1032 + i * q, 560 + j * q, q, q); }
    ctx.fillStyle = '#ecebe6'; ctx.fillRect(1032, 680, 64, 64);
    const tex = U.srgb(canvasTex(c)); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return { tex, grid: atlasRect(W, H, 0, 0, 1024, 1024), logos: atlasRect(W, H, 1024, 0, 1024, 512), cheq: atlasRect(W, H, 1032, 560, 48 * q, 4 * q), white: atlasRect(W, H, 1032, 680, 64, 64) };
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
      this.sectors = [this.length / 3, 2 * this.length / 3];
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
    cornerNameAt(s) { let name = ''; for (const c of this.data.corners) if (s >= c.s - 40) name = c.name; return name || this.data.corners[this.data.corners.length - 1].name; }
    sectorAt(s) { return s < this.sectors[0] ? 0 : s < this.sectors[1] ? 1 : 2; }
    gridSlot(pos) {
      const s = this.sf - 10 - pos * 8; const i = this.idxAtS(s); const side = (pos % 2 === 0 ? -1 : 1) * 2.6;
      return { x: this.x[i] + this.nx[i] * side, z: this.z[i] + this.nz[i] * side, y: this.y[i], heading: this.heading[i], i };
    }

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
        const v = (i * this.ds) / (opts.vScale || 8); uv.push(0, v, 1, v);
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
      const common = { eiAux: { value: T.aux }, eiSP: { value: sp }, eiHW: { value: hw }, eiKW: { value: kw } };
      const kk = this.smooth(this.k, 6); const kerbMask = i => Math.abs(kk[i]) > 1 / 420;
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
      const aMat = shaderMat({ map: T.asphalt.map, normalMap: T.asphalt.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: T.asphalt.roughnessMap, roughness: 1, metalness: 0 }, 'asphalt', common, VARY4, ASPHALT_FRAG, ASPHALT_ROUGH, FLATTEN);
      const aMesh = new THREE.Mesh(aGeo, aMat); aMesh.receiveShadow = true; aMesh.name = 'asphalt'; g.add(aMesh);

      // ------------------------------------------------ kerbs: bevelled profile (rise, top, fall), sawtooth red/white tiled by arc length
      const kerbTex = kerbTexture();
      const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, vertexColors: true, roughness: 0.48, metalness: 0, normalMap: T.runoff.normalMap, normalScale: new THREE.Vector2(0.25, 0.25) });
      const ramp = new Float32Array(n); { const a = new Float32Array(n), b = new Float32Array(n);
        for (let k = 0; k < 2 * n; k++) { const i = k % n, p = (i + n - 1) % n; a[i] = kerbMask(p) ? a[p] + 1 : 0; }
        for (let k = 2 * n; k >= 0; k--) { const i = k % n, q = (i + 1) % n; b[i] = kerbMask(i) ? b[q] + 1 : 0; }
        for (let i = 0; i < n; i++) ramp[i] = U.clamp(Math.min(a[i], b[i]) * ds / 3.0, 0, 1); }
      const prof = [[0, 0.004], [0.3, 0.068], [kw - 0.32, 0.074], [kw, 0.0]];
      const kerbTone = new Float32Array(n); for (let i = 0; i < n; i++) kerbTone[i] = 0.82 + 0.18 * U.noise2(i * 0.11, 4.2);
      for (const side of [-1, 1]) {
        // stripes advance with the arc length at the kerb's middle so they never stretch on the outside of a corner
        const arc = new Float32Array(n + 1); let acc = 0;
        for (let i = 1; i <= n; i++) { const a = (i - 1) % n, b = i % n; const m = side * (hw + kw / 2); const d = Math.hypot(this.x[b] + this.nx[b] * m - this.x[a] - this.nx[a] * m, this.z[b] + this.nz[b] * m - this.z[a] - this.nz[a] * m); acc = kerbMask(a) ? acc + d : 0; arc[b] = acc; if (i === n) arc[n] = acc; }
        for (let pIdx = 0; pIdx < 3; pIdx++) {
          const p0 = prof[pIdx], p1 = prof[pIdx + 1];
          const geo = this.strip(2, {
            mask: kerbMask, normals: 'compute',
            lat: (ii, c) => side * (hw + (c ? p1[0] : p0[0])),
            y: (ii, c) => (c ? p1[1] : p0[1]) * (0.15 + 0.85 * ramp[ii]),
            uv: (ii, c, l, i) => [(c ? p1[0] : p0[0]) / kw, (i === n ? arc[n] : arc[ii]) / 2.4],
            attrs: { color: [3, (ii, c) => { const t = kerbTone[ii] * (c === 0 && pIdx === 0 ? 0.9 : 1); return [t, t, t]; }] },
          });
          const m = new THREE.Mesh(geo, kerbMat); m.receiveShadow = true; m.castShadow = pIdx === 1; m.name = 'kerb'; g.add(m);
        }
      }
      this.buildSausages(g);

      // ------------------------------------------------ run-off: shoulder everywhere, green strip behind kerbs, painted asphalt at the big corners, gravel beyond
      const cornerAt = (s) => { let name = null; for (const c of this.data.corners) if (s >= c.s - 60) name = c.name; return name; };
      const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
      const BLUE = lin(0x2457a6), RED = lin(0xc4122a), GREEN = lin(0x2f8a3c), DBLUE = lin(0x1b3f86);
      const SCHEMES = {
        Copse: [0, RED, BLUE], Luffield: [1, BLUE, RED], Woodcote: [1, BLUE, RED], Stowe: [0, GREEN, BLUE], Vale: [2, RED, BLUE], Club: [2, RED, BLUE],
        Abbey: [1, GREEN, BLUE], Village: [1, RED, BLUE], 'The Loop': [1, RED, BLUE], Brooklands: [0, GREEN, DBLUE],
      };
      const aw0 = hw + kw + 2.0;
      const rMat = shaderMat({ map: T.runoff.map, normalMap: T.runoff.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: T.runoff.roughnessMap, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 }, 'runoff', common, VARY_RUN, RUNOFF_FRAG, RUNOFF_ROUGH, FLATTEN);
      const gMat = shaderMat({ map: T.gravel.map, normalMap: T.gravel.normalMap, normalScale: new THREE.Vector2(1.25, 1.25), roughnessMap: T.gravel.roughnessMap, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 3 }, 'gravel', common, VARY4, GRAVEL_FRAG, GRAVEL_ROUGH, '', GRAVEL_NORMAL);
      this.surfMats = { runoff: rMat, gravel: gMat };
      for (const side of [-1, 1]) {
        const run = side < 0 ? this.runoffL : this.runoffR, grav = side < 0 ? this.gravelL : this.gravelR, wall = side < 0 ? this.wallL : this.wallR;
        // outer edge: dilate then smooth so the run-off tapers in and out and never leaves a gap to the gravel
        const raw = new Float32Array(n); for (let i = 0; i < n; i++) raw[i] = run[i] ? hw + kw + (grav[i] ? 7.05 : 14) : kerbMask(i) ? aw0 + 0.05 : hw + 1.0;
        const dil = new Float32Array(n); for (let i = 0; i < n; i++) { let m = 0; for (let j = -4; j <= 4; j++) m = Math.max(m, raw[(i + j + n) % n]); dil[i] = m; }
        const outer = this.smooth(dil, 4); for (let i = 0; i < n; i++) outer[i] = Math.max(hw + 0.6, Math.min(outer[i], wall[i] - 0.4));
        // paint scheme per row (corner name), spread one row so the colour attribute is constant across each paint boundary quad
        const sch = new Int8Array(n).fill(-1); const names = Object.keys(SCHEMES);
        for (let i = 0; i < n; i++) if (run[i]) { const nm = cornerAt(this.s[i]); const k = names.indexOf(nm); if (k >= 0) sch[i] = k; }
        const schC = Int8Array.from(sch); for (let i = 0; i < n; i++) if (sch[i] < 0) { for (const j of [1, -1, 2, -2]) { const q = sch[(i + j + n) % n]; if (q >= 0) { schC[i] = q; break; } } }
        const green = new Uint8Array(n); for (let i = 0; i < n; i++) green[i] = kerbMask(i) || run[i] ? 1 : 0;
        const geo = this.strip(2, {
          lat: (ii, c) => side * (c ? outer[ii] : hw - 0.05), uv: (ii, c, l, i) => [l / 4, i * ds / per(4)],
          attrs: {
            trk: [4, (ii, c, l, i) => [l, i * ds, sch[ii] >= 0 ? 1 : 0, schC[ii] >= 0 ? SCHEMES[names[schC[ii]]][0] : 0]],
            trk2: [4, (ii) => [green[ii], grav[ii] ? hw + kw + 6.9 : 99, aw0, outer[ii]]],
            colA: [3, (ii) => { const c = schC[ii] >= 0 ? SCHEMES[names[schC[ii]]][1] : BLUE; return [c.r, c.g, c.b]; }],
            colB: [3, (ii) => { const c = schC[ii] >= 0 ? SCHEMES[names[schC[ii]]][2] : BLUE; return [c.r, c.g, c.b]; }],
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
      const vergeOff = (ii, c) => c ? this.wallR[ii] + 40 : -(this.wallL[ii] + 40);
      const vGeo = this.strip(2, {
        lat: vergeOff, uv: (ii, c, l, i) => [l / 3, i * ds / per(3)],
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
      const corners = ['Abbey', 'Village', 'The Loop', 'Brooklands', 'Luffield', 'Copse', 'Stowe', 'Vale', 'Club'];
      const prof = [[-0.3, 0], [-0.26, 0.07], [-0.17, 0.135], [-0.06, 0.16], [0.06, 0.16], [0.17, 0.135], [0.26, 0.07], [0.3, 0]];
      const pos = [], col = [], idx = []; const yel = new THREE.Color(0xf2b705).convertSRGBToLinear(), dirt = new THREE.Color(0x7a6a3a).convertSRGBToLinear(), blk = new THREE.Color(0x1a1a1a);
      const seen = {}; this.sausages = [];
      this.data.corners.forEach((c, ci) => {
        if (corners.indexOf(c.name) < 0) return;
        const next = this.data.corners[ci + 1]; const sEnd = next ? Math.min(next.s, c.s + 200) : c.s + 200;
        let best = -1, bk = 0; for (let s = c.s - 30; s < sEnd; s += this.ds) { const i = this.idxAtS(s); if (Math.abs(kk[i]) > bk) { bk = Math.abs(kk[i]); best = i; } }
        if (best < 0 || bk < 1 / 260 || seen[best]) return; seen[best] = true;
        const side = kk[best] > 0 ? 1 : -1;                        // centre of curvature side = inside
        const wall = side < 0 ? this.wallL[best] : this.wallR[best]; const R = 1 / bk; const lat0 = hw + kw + 1.5 + 0.3;
        if (lat0 + 0.6 > Math.min(wall - 0.5, 0.85 * R)) return;
        const sA = this.s[best]; this.sausages.push({ name: c.name, s: sA, side });
        for (let piece = -1; piece <= 1; piece++) {
          const s0 = sA + piece * 4.4 - 2.0, s1 = s0 + 4.0; const steps = 8;
          for (let r = 0; r <= steps; r++) {
            const fs = r / steps; const f = this.frameAt(s0 + (s1 - s0) * fs); const end = Math.min(1, Math.min(fs, 1 - fs) * 4.5 + 0.12);
            for (let k = 0; k < prof.length; k++) {
              const l = side * (lat0 + prof[k][0]); const h = prof[k][1] * end;
              pos.push(f.x + f.nx * l, f.y + h, f.z + f.nz * l);
              const cc = (k === 0 || k === prof.length - 1) ? dirt : (r === 0 || r === steps) ? blk : yel; const t = 0.85 + 0.15 * U.noise2(s0 * 3 + r, k); col.push(cc.r * t, cc.g * t, cc.b * t);
            }
            if (r > 0) { const base = pos.length / 3 - prof.length * 2; for (let k = 0; k < prof.length - 1; k++) { const a = base + k, b = base + prof.length + k; if (side > 0) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1); } }
          }
        }
      });
      if (!idx.length) return;
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide })); m.castShadow = true; m.receiveShadow = true; m.name = 'sausageKerbs'; g.add(m);
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
      for (let p = 0; p < 20; p++) {
        const s = sf - 10 - p * 8, side = (p % 2 === 0 ? -1 : 1) * 2.6; const cu = (p % 5) / 5, cv = Math.floor(p / 5) / 4;
        // cell covers 3.6 m across x 7.2 m along, front of the slot 3.1 m ahead of the car's centre
        this.addDecal(b, s + 3.1 - 7.2 + 2.2, s + 3.1 + 2.2, side - 1.8, side + 1.8, (fs, fl) => A.grid(cu + (1 - fl) * 0.2, 1 - (cv + (1 - fs) * 0.25)), 3);
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
      const spots = this.data.logoSpots || [['Copse', 0, 34], ['Luffield', 1, 30], ['Stowe', 1, 32], ['Club', 2, 26], ['Abbey', 0, 32], ['Village', 1, 26], ['Brooklands', 0, 28], ['Vale', 3, 24], ['Woodcote', 1, 26], ['Maggotts', 0, 26], ['Becketts', 1, 26], ['Chapel Curve', 2, 24], ['The Loop', 3, 20], ['Aintree', 0, 22], ['Farm Curve', 1, 24]];
      for (const [name, slot, len] of spots) {
        const c = this.data.corners.find(cc => cc.name === name); if (!c) continue;
        // the painted run-off is on the outside: find the widest run-off point in the corner
        let best = -1, bw = 0, bside = 1;
        for (let s = c.s; s < c.s + 160; s += 4) { const i = this.idxAtS(U.mod(s, L)); for (const side of [-1, 1]) { const run = side < 0 ? this.runoffL : this.runoffR; const outer = side < 0 ? this.runoffOuterL : this.runoffOuterR; if (run[i] && outer[i] > bw) { bw = outer[i]; best = s; bside = side; } } }
        if (best >= 0) place(best, bside, slot, len);
      }
      if (lb.idx.length) { const lm = Track.batchMesh(lb, mat); lm.name = 'runoffLogos'; lm.userData.decor = true; g.add(lm); }
    }

    buildBarriers(g) {
      const kk = this.smooth(this.k, 12);
      // sponsor wall panels (concrete wall with advertising) in corners, Armco on straights, tyre walls at the big stops.
      // One atlas for all four: each is a band across u (0 = bottom of the wall, 1 = top) and repeats along v (the lap distance);
      // a second texture with the same layout carries roughness (G) and metalness (B)
      const AW = 640, AH = 1024;
      const ca = document.createElement('canvas'); ca.width = AW; ca.height = AH; const cx = ca.getContext('2d');
      const cr = document.createElement('canvas'); cr.width = AW; cr.height = AH; const rx = cr.getContext('2d');
      const band = (k, rough, metal) => { rx.fillStyle = 'rgb(255,' + Math.round(rough * 255) + ',' + Math.round(metal * 255) + ')'; rx.fillRect(k * 128, 0, 128, AH); };
      // panels: 5 partner boards along 25.6 m, text running along the wall (drawn rotated: canvas y is the lap direction).
      // Band 0 reads left to right along +s (left-hand wall), band 4 is the same art flipped along the lap for the right-hand wall
      { const ph = AH / 5; EI.Ads.BARRIER.forEach((paint, i) => { for (const flip of [0, 1]) { cx.save(); cx.beginPath(); cx.rect(flip * 512, i * ph, 128, ph); cx.clip(); cx.translate(flip * 512 + 128, i * ph + flip * ph); cx.rotate(Math.PI / 2); if (flip) cx.scale(-1, 1); const vw = 128 * EI.Ads.BARRIER_ASPECT; cx.scale(ph / vw, 1); paint(cx, vw, 128); cx.restore(); } });
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
        const isTyre = i => inCorner(i) && tyreCorners.indexOf(cornerAt(this.s[i])) >= 0 && (side < 0 ? kk[i] > 0 : kk[i] < 0);
        const isPanel = i => !armco && !isTyre(i) && (inCorner(i) || Math.abs(this.s[i] - this.sf) < 500);
        // concrete base + panels
        const pg = toBand(this.ribbon(i => side * wall[i], i => side * wall[i], { mask: isPanel, ya: () => 0.5, yb: () => 1.2, vScale: 25.6 }), side < 0 ? 0 : 4);
        g.add(new THREE.Mesh(pg, barMat));
        const cg = toBand(this.ribbon(i => side * wall[i], i => side * wall[i], { mask: isPanel, ya: () => 0, yb: () => 0.5 }), 3);
        const cm = new THREE.Mesh(cg, barMat); cm.castShadow = true; g.add(cm);
        const tg = toBand(this.ribbon(i => side * wall[i], i => side * wall[i], { mask: isTyre, ya: () => 0, yb: () => 1.0, vScale: 2.6 }), 1);
        const tm = new THREE.Mesh(tg, barMat); tm.castShadow = true; g.add(tm);
        const ag = toBand(this.ribbon(i => side * wall[i], i => side * wall[i], { mask: i => !isTyre(i) && !isPanel(i), ya: () => 0.1, yb: () => 0.8, vScale: 4 }), 2);
        g.add(new THREE.Mesh(ag, barMat));
      }
      // debris fence
      const fenceTex = (function () { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 64, 64); ctx.strokeStyle = 'rgba(30,30,30,0.85)'; ctx.lineWidth = 1.2;
        for (let i = 0; i <= 64; i += 6) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke(); } ctx.fillStyle = '#555'; ctx.fillRect(0, 0, 3, 64);
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
      const fenceMat = new THREE.MeshBasicMaterial({ map: fenceTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.7 });
      for (const side of [-1, 1]) {
        const wall = side < 0 ? this.wallL : this.wallR;
        const TD = this.data.tunnel; const fg = this.ribbon(i => side * (wall[i] + 0.8), i => side * (wall[i] + 0.8), { ya: () => 0, yb: () => 3.4, vScale: 3, mask: TD ? (i => this.s[i] < TD.s0 - 6 || this.s[i] > TD.s1 + 6) : undefined });
        const fm = new THREE.Mesh(fg, fenceMat); fm.name = 'fence'; g.add(fm);
      }
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
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: T.asphalt.map, normalMap: T.asphalt.normalMap, roughnessMap: T.asphalt.roughnessMap, color: 0xdedcd8, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
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
      const white = U.srgb(solidTexture('#ecebe6'));
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
      [150, 100, 50].forEach((d, k) => cell('brake:' + d, k * 160, 1888, 160, 160, (ctx, w, h) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#0d3a2b'; ctx.lineWidth = 9; ctx.strokeRect(4.5, 4.5, w - 9, h - 9); ctx.fillStyle = '#111'; ctx.font = '900 ' + (d > 99 ? 65 : 81) + 'px Arial Black, Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(d), w / 2, h / 2 + 4); }));
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
      const i0 = this.idxAtS(this.sf + 6); const gantry = new THREE.Group();
      for (const side of [-1, 1]) { const post = solid(new THREE.BoxGeometry(0.5, 7.5, 0.5), 'post'); post.position.set(0, 3.75, side * (hw + 1.6)); post.castShadow = true; gantry.add(post); }
      const beamLen = hw * 2 + 3.6;
      for (const [yy, zz] of [[7.0, -0.35], [7.0, 0.35], [7.8, -0.35], [7.8, 0.35]]) { const chord = solid(new THREE.BoxGeometry(0.1, 0.1, beamLen), 'post'); chord.position.set(zz, yy, 0); gantry.add(chord); }
      for (let zq = -beamLen / 2; zq <= beamLen / 2; zq += 1.2) { const diag = solid(new THREE.BoxGeometry(0.06, 1.1, 0.06), 'post', true); diag.position.set(0.35, 7.4, zq); diag.rotation.x = 0.6; gantry.add(diag); const diag2 = diag.clone(); diag2.position.x = -0.35; diag2.rotation.x = -0.6; gantry.add(diag2); const vert = solid(new THREE.BoxGeometry(0.7, 0.06, 0.06), 'post', true); vert.position.set(0, 7.0, zq); gantry.add(vert); }
      const banner = new THREE.Mesh(uvFace(new THREE.PlaneGeometry(beamLen - 1, 0.9), 'banner'), mat); banner.position.set(-0.42, 8.45, 0); banner.rotation.y = -Math.PI / 2; gantry.add(banner);
      const panel = solid(new THREE.BoxGeometry(0.5, 1.7, 6.6), 'black'); panel.position.y = 6.2; gantry.add(panel);
      for (let c = 0; c < 5; c++) for (let rr = 0; rr < 2; rr++) { const hood = solid(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14), 'hood'); hood.rotation.z = Math.PI / 2; hood.position.set(-0.3, 6.55 - rr * 0.65, (c - 2) * 1.15); gantry.add(hood); }
      // the lamps change colour at the start: kept as separate meshes (not merged)
      this.startLights = []; const offMat = new THREE.MeshBasicMaterial({ color: 0x2a0b0b });
      for (let c = 0; c < 5; c++) { const col = []; for (let rr = 0; rr < 2; rr++) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), offMat.clone()); lamp.position.set(-0.25, 6.55 - rr * 0.65, (c - 2) * 1.15); lamp.name = 'startLamp'; gantry.add(lamp); col.push(lamp); } this.startLights.push(col); }
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
      for (const c of this.data.corners) { if (stops.indexOf(c.name) < 0 || named['_d' + c.name]) continue; named['_d' + c.name] = true; const side = outsideAt(c.s + 30); for (const d of [150, 100, 50]) addBoard(c.s - d, side, 'brake:' + d, 1.5, 1.5, 1.45, Math.min(wallAt(c.s - d, side) - 1.4, this.halfWidth + this.kerbWidth + 4)); }
      for (const z of this.drs) { const dd = (s, sd, w) => Math.min(wallAt(s, sd) - 0.6 - w / 2, this.halfWidth + 5 + w / 2); addBoard(z.detect, -1, 'drsDetect', 4, 1.0, 2.3, dd(z.detect, -1, 4)); addBoard(z.start, -1, 'drs', 2.4, 1.2, 2.2, dd(z.start, -1, 2.4)); addBoard(z.start, 1, 'drs', 2.4, 1.2, 2.2, dd(z.start, 1, 2.4)); }
      // sponsor bridges
      const bridge = (s, text, beam) => {
        const i = this.idxAtS(s); const grp = new THREE.Group();
        for (const side of [-1, 1]) { const post = solid(new THREE.BoxGeometry(0.8, 8, 0.8), 'post'); post.position.set(0, 4, side * (hw + 3)); post.castShadow = true; grp.add(post); }
        const b = solid(new THREE.BoxGeometry(1.2, 2.2, hw * 2 + 7), beam); b.position.y = 8.5; b.castShadow = true; grp.add(b);
        for (const dir of [-1, 1]) { const f = new THREE.Mesh(uvFace(new THREE.PlaneGeometry(hw * 2 + 6.8, 2.1), 'bridge:' + text), mat); f.position.set(dir * 0.62, 8.5, 0); f.rotation.y = dir * Math.PI / 2; grp.add(f); }
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
      const keep = new Set(); for (const col of this.startLights || []) for (const l of col) keep.add(l);
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
      for (const m of this.batches || []) {
        const d = m.userData; m.geometry.setDrawRange(0, low ? d.coreCount : Infinity); m.visible = !(low && d.coreCount === 0);
        if (m.name === 'fence') m.visible = !low;
        if (m.name === 'furniture') m.castShadow = !low && d.castShadow;
      }
      const an = low ? 2 : q === 'high' ? 8 : 4; const T = Track._tex;
      if (T) for (const k of ['asphalt', 'runoff', 'grass', 'gravel']) for (const tk of ['map', 'normalMap', 'roughnessMap']) { const t = T[k] && T[k][tk]; if (t && t.anisotropy !== an) { t.anisotropy = an; t.needsUpdate = true; } }
    }
    setStartLights(count) { if (!this.startLights) return; this.startLights.forEach((col, c) => col.forEach(l => { l.material.color.setHex(c < count ? 0xff1a1a : 0x2a0b0b); })); }
  }
  EI.Track = Track;
})();
