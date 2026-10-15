// Equation I - vegetation: painted billboard trees (oak, ash, lombardy poplar, scots pine, hawthorn hedge shrubs),
// woodland blocks, hedgerows on every field boundary, tree lines, distant tree-line strips and instanced verge grass cards.
window.EI = window.EI || {};
(function () {
  const U = EI.U, Env = EI.Env;
  const Veg = {};
  const SP = { OAK: 0, POPLAR: 1, PINE: 2, SHRUB: 3 };
  Veg.SP = SP;

  // ---------------------------------------------------------------- tree atlas: 4 species x (2 side views + 1 top view), 512 px cells
  // canvas rows (top to bottom): top views, side B, side A  -> uv rows 2, 1, 0 (flipY)
  function paintAtlas() {
    const CW = 512; const [c, ctx] = Env.canvas(CW * 4, CW * 3); ctx.clearRect(0, 0, c.width, c.height);
    const rgb = (a, k, al) => 'rgba(' + (U.clamp(a[0] * k, 0, 255) | 0) + ',' + (U.clamp(a[1] * k, 0, 255) | 0) + ',' + (U.clamp(a[2] * k, 0, 255) | 0) + ',' + (al == null ? 1 : al) + ')';
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    // one leaf mass: many small leaf dabs inside an ellipse, lit from above, darker below and inside, sunlit translucent tips on top
    const lobe = (r, ox, oy, L, pal, global) => {
      const n = Math.round(L.rx * L.ry * pal.density);
      for (let i = 0; i < n; i++) {
        const a = r() * 6.283, rad = Math.sqrt(r()); const lx = Math.cos(a) * rad, ly = Math.sin(a) * rad;
        const x = L.x + lx * L.rx, y = L.y + ly * L.ry;
        // light: from the top (slightly left); shadowed core and underside
        let lit = U.clamp(0.5 - ly * 0.55 - lx * 0.12 + (rad - 0.5) * 0.25, 0, 1);
        lit *= global(y); lit = U.clamp(lit + (r() - 0.5) * 0.35, 0, 1);
        const col = lit < 0.5 ? mixc(pal.dark, pal.mid, lit * 2) : mixc(pal.mid, pal.light, (lit - 0.5) * 2);
        const s = pal.leaf * (0.6 + r() * 0.8) * (rad > 0.85 ? 0.7 : 1);
        ctx.fillStyle = rgb(col, 1); ctx.beginPath(); ctx.ellipse(ox + x, oy + y, s * (1 + r() * 0.6), s * (0.55 + r() * 0.4), r() * 3.14, 0, 6.283); ctx.fill();
      }
      // a few sky holes through the outer part of the lobe
      if (pal.holes) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; for (let i = 0; i < pal.holes; i++) { const a = r() * 6.283, rad = 0.55 + r() * 0.4; ctx.beginPath(); ctx.ellipse(ox + L.x + Math.cos(a) * rad * L.rx, oy + L.y + Math.sin(a) * rad * L.ry, 2 + r() * 5, 2 + r() * 4, r() * 3, 0, 6.283); ctx.fill(); } ctx.restore(); }
      // translucent sunlit leaves on the upper rim
      for (let i = 0; i < n * 0.06; i++) {
        const a = -Math.PI / 2 + (r() - 0.5) * 2.2, rad = 0.7 + r() * 0.32; const x = L.x + Math.cos(a) * rad * L.rx, y = L.y + Math.sin(a) * rad * L.ry;
        ctx.fillStyle = rgb(pal.glow, 1, 0.75); ctx.beginPath(); ctx.ellipse(ox + x, oy + y, pal.leaf * 0.8, pal.leaf * 0.45, r() * 3, 0, 6.283); ctx.fill();
      }
    };
    const trunk = (ox, oy, x, y0, y1, w0, w1, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(ox + x - w0 / 2, oy + y0); ctx.lineTo(ox + x - w1 / 2, oy + y1); ctx.lineTo(ox + x + w1 / 2, oy + y1); ctx.lineTo(ox + x + w0 / 2, oy + y0); ctx.closePath(); ctx.fill(); };
    const branch = (ox, oy, x0, y0, x1, y1, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ox + x0, oy + y0); ctx.quadraticCurveTo(ox + (x0 + x1) / 2 + (x1 - x0) * 0.1, oy + (y0 + y1) / 2 - 10, ox + x1, oy + y1); ctx.stroke(); };
    const PAL = {
      oak: { dark: [20, 26, 16], mid: [46, 56, 31], light: [84, 94, 54], glow: [124, 130, 80], leaf: 5.5, density: 0.07, holes: 5 },
      ash: { dark: [24, 30, 18], mid: [54, 64, 36], light: [96, 104, 62], glow: [140, 144, 94], leaf: 4.8, density: 0.065, holes: 7 },
      poplar: { dark: [24, 30, 18], mid: [54, 64, 34], light: [94, 104, 58], glow: [134, 140, 86], leaf: 4.5, density: 0.07 },
      pine: { dark: [16, 22, 18], mid: [34, 42, 32], light: [64, 72, 52], glow: [100, 106, 76], leaf: 5, density: 0.08 },
      shrub: { dark: [22, 28, 16], mid: [50, 60, 32], light: [90, 98, 56], glow: [130, 136, 84], leaf: 5, density: 0.07 },
      shrub2: { dark: [28, 30, 18], mid: [62, 64, 38], light: [104, 104, 64], glow: [160, 154, 120], leaf: 4.5, density: 0.07 },
    };
    const bark = '#3b2c1e', barkLight = '#5a4632', pineBark = '#7a4a2c';
    // ---- oak / ash (side views): short forked trunk, broad lumpy crown that comes down low at the sides
    const oakSide = (ox, oy, seed, pal, ash) => {
      const r = U.rng(seed); const base = ash ? 360 : 400;
      trunk(ox, oy, 256, 512, base - 40, ash ? 22 : 34, ash ? 14 : 22, bark); trunk(ox, oy, 262, 512, base, 10, 6, barkLight);
      for (let b = 0; b < 7; b++) { const dir = b % 2 ? 1 : -1; branch(ox, oy, 256 + dir * 4, base - 10 - b * 12, 256 + dir * (70 + r() * 140), base - 120 - r() * 170, (ash ? 7 : 10) - b, bark); }
      const lobes = []; const n = ash ? 20 : 22; const cy = ash ? 190 : 215, ry = ash ? 150 : 165, rx = ash ? 200 : 228;
      for (let i = 0; i < n; i++) {
        const a = r() * 6.283, d = Math.pow(r(), 0.6) * 0.82; let x = Math.cos(a) * d * rx, y = Math.sin(a) * d * ry;
        if (y > 0) y *= 0.75 + 0.25 * Math.abs(x) / rx; // flatter underside, sides hang lower than the middle
        lobes.push({ x: 256 + x, y: cy + y, rx: (ash ? 40 : 48) + r() * 34, ry: (ash ? 34 : 40) + r() * 26 });
      }
      lobes.sort((a, b) => a.y - b.y);
      const global = (y) => 1.08 - U.clamp((y - 60) / 340, 0, 1) * 0.62;
      for (const L of lobes) lobe(r, ox, oy, L, pal, global);
    };
    // ---- lombardy poplar
    const poplarSide = (ox, oy, seed, pal) => {
      const r = U.rng(seed); trunk(ox, oy, 256, 512, 420, 18, 12, bark);
      const global = (y) => 1.05 - U.clamp((y - 40) / 460, 0, 1) * 0.45;
      for (let i = 0; i < 16; i++) { const y = 40 + i * 27 + r() * 10; const wmax = 84 * Math.sin(Math.PI * U.clamp((y - 10) / 480, 0, 1)) ** 0.6 + 16; lobe(r, ox, oy, { x: 256 + (r() - 0.5) * 24, y, rx: wmax * (0.7 + r() * 0.3), ry: 34 + r() * 10 }, pal, global); }
    };
    // ---- scots pine: tall bare orange trunk, irregular rounded crown up top with a couple of detached lower clumps
    const pineSide = (ox, oy, seed, pal) => {
      const r = U.rng(seed); trunk(ox, oy, 256, 512, 70, 24, 10, pineBark); trunk(ox, oy, 250, 512, 120, 7, 3, '#9a6a44');
      const pads = [];
      for (let i = 0; i < 10; i++) { const a = r() * 6.283, d = Math.sqrt(r()); pads.push({ x: 256 + Math.cos(a) * d * 120, y: 120 + Math.sin(a) * d * 60, rx: 50 + r() * 40, ry: 30 + r() * 20 }); }
      for (let i = 0; i < 3; i++) { const sd = i % 2 ? 1 : -1; const x = 256 + sd * (50 + r() * 70), y = 220 + r() * 90; branch(ox, oy, 256, y + 26, x, y + 6, 6, pineBark); pads.push({ x, y, rx: 40 + r() * 30, ry: 22 + r() * 12 }); }
      pads.sort((a, b) => a.y - b.y); const global = (y) => 1.0 - U.clamp((y - 60) / 260, 0, 1) * 0.4;
      for (const L of pads) lobe(r, ox, oy, L, pal, global);
    };
    // ---- hedge shrub (hawthorn / blackthorn): dense dome down to the ground
    const shrubSide = (ox, oy, seed, pal) => {
      const r = U.rng(seed); const global = (y) => 1.05 - U.clamp((y - 150) / 360, 0, 1) * 0.6;
      const lobes = []; for (let i = 0; i < 16; i++) { const a = Math.PI + r() * Math.PI, d = Math.sqrt(r()) * 0.85; lobes.push({ x: 256 + Math.cos(a) * d * 200, y: 420 + Math.sin(a) * d * 220, rx: 60 + r() * 40, ry: 50 + r() * 34 }); }
      lobes.push({ x: 256, y: 440, rx: 230, ry: 70 }); lobes.sort((a, b) => a.y - b.y);
      for (const L of lobes) { L.y = Math.min(L.y, 512 - L.ry * 0.6); lobe(r, ox, oy, L, pal, global); }
    };
    // ---- top views (canopy from above)
    const top = (ox, oy, seed, pal, R, n, clumpy) => {
      const r = U.rng(seed); const global = () => 1;
      for (let i = 0; i < n; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * 0.7 * R; const rr = (clumpy ? 40 : 70) + r() * 40; lobe(r, ox, oy, { x: 256 + Math.cos(a) * d, y: 256 + Math.sin(a) * d, rx: rr, ry: rr }, pal, global); }
    };
    const rowA = CW * 2, rowB = CW, rowT = 0;
    const cell = (ox, oy, fn) => { ctx.save(); ctx.beginPath(); ctx.rect(ox + 6, oy + 6, CW - 12, CW - 8); ctx.clip(); fn(); ctx.restore(); };
    cell(0, rowA, () => oakSide(0, rowA, 11, PAL.oak, false)); cell(0, rowB, () => oakSide(0, rowB, 23, PAL.ash, true)); cell(0, rowT, () => top(0, rowT, 5, PAL.oak, 200, 12));
    cell(CW, rowA, () => poplarSide(CW, rowA, 31, PAL.poplar)); cell(CW, rowB, () => poplarSide(CW, rowB, 37, PAL.poplar)); cell(CW, rowT, () => top(CW, rowT, 7, PAL.poplar, 150, 8));
    cell(CW * 2, rowA, () => pineSide(CW * 2, rowA, 41, PAL.pine)); cell(CW * 2, rowB, () => pineSide(CW * 2, rowB, 47, PAL.pine)); cell(CW * 2, rowT, () => top(CW * 2, rowT, 9, PAL.pine, 180, 9, true));
    cell(CW * 3, rowA, () => shrubSide(CW * 3, rowA, 53, PAL.shrub)); cell(CW * 3, rowB, () => shrubSide(CW * 3, rowB, 59, PAL.shrub2)); cell(CW * 3, rowT, () => top(CW * 3, rowT, 13, PAL.shrub, 200, 12));
    return Env.cutout(c, { aniso: 4 });
  }

  // ---------------------------------------------------------------- tree geometry
  // near LOD: three vertical cards 60 degrees apart (the second shows the other side view, each card a slightly different tint,
  // so the crown has depth from every angle) + a horizontal canopy card; rounded normals
  function treeGeometry() {
    const pos = [], nrm = [], uv = [], top = [], idx = [], tint = [], cvar = [];
    const card = (ang, tn, vr) => {
      const b = pos.length / 3; const ax = Math.cos(ang), az = Math.sin(ang);
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const s = u - 0.5; pos.push(ax * s, v, az * s); uv.push(u, v); top.push(0); tint.push(tn[0], tn[1], tn[2]); cvar.push(vr);
        const nx = ax * s * 1.1, ny = 0.45 + v * 0.7, nz = az * s * 1.1; const l = Math.hypot(nx, ny, nz); nrm.push(nx / l, ny / l, nz / l);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    card(0, [1, 1, 1], 0); card(Math.PI / 3, [0.84, 0.88, 0.8], 1); card(Math.PI * 2 / 3, [1.08, 1.06, 0.96], 0);
    const b = pos.length / 3; const y = 0.62, s = 0.44;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { pos.push((u - 0.5) * 2 * s, y, (0.5 - v) * 2 * s); uv.push(u, v); top.push(1); nrm.push(0, 1, 0); tint.push(1.04, 1.04, 1); cvar.push(0); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('isTop', new THREE.Float32BufferAttribute(top, 1)); g.setAttribute('ctint', new THREE.Float32BufferAttribute(tint, 3)); g.setAttribute('cvar', new THREE.Float32BufferAttribute(cvar, 1)); g.setIndex(idx);
    return g;
  }
  // per-instance records (vec4 x3): iA = (x, y, z, yaw), iB = (width, height, species, variant), iC = (r, g, b, blob)
  // the LOD window uLod = (inner, outer) metres from the eye is applied per tree in the vertex shader (collapsed outside), so the
  // near and far sets never overlap even between two CPU regathers
  const TREE_HEAD = '#include <common>\nattribute vec4 iA;\nattribute vec4 iB;\nattribute vec4 iC;\nuniform vec3 uEye;\nuniform vec2 uLod;\nvarying vec3 vTint;\n';
  function nearPatch(sh, uni, depth) {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', TREE_HEAD + 'attribute float isTop;\nattribute vec3 ctint;\nattribute float cvar;')
      .replace('#include <beginnormal_vertex>', 'float nY = iA.w; vec3 objectNormal = vec3(cos(nY) * normal.x + sin(nY) * normal.z, normal.y, -sin(nY) * normal.x + cos(nY) * normal.z);')
      .replace('#include <begin_vertex>', [
        'vec3 transformed = vec3(position); float sp = iB.z;',
        'if (isTop > 0.5) { transformed.xz *= sp < 0.5 ? 1.0 : sp < 1.5 ? 0.4 : sp < 2.5 ? 0.8 : 1.05; transformed.y = sp < 0.5 ? 0.6 : sp < 1.5 ? 0.55 : sp < 2.5 ? 0.74 : 0.52; }',
        'transformed.xz *= iB.x; transformed.y *= iB.y; float tc = cos(iA.w), ts = sin(iA.w);',
        'transformed = vec3(tc * transformed.x + ts * transformed.z, transformed.y, -ts * transformed.x + tc * transformed.z) + iA.xyz;',
        'float dE = distance(iA.xz, uEye.xz); if (dE < uLod.x || dE >= uLod.y) transformed = iA.xyz;',
        'vTint = iC.rgb * ctint;'].join('\n'))
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv = (uv * vec2(0.98, 0.985) + vec2(0.01, 0.004) + vec2(iB.z, isTop > 0.5 ? 2.0 : mod(iB.w + cvar, 2.0))) * vec2(0.25, 1.0 / 3.0);\n#endif');
    if (depth) sh.vertexShader = sh.vertexShader.replace('vTint = iC.rgb * ctint;', 'vTint = iC.rgb * ctint; if (dE > 200.0) transformed = iA.xyz;');
    if (!depth) { sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTint;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vTint;'); Env.noFlip(sh); }
  }
  // far LOD: one card turned to the camera about the vertical axis (side view A of the species)
  function farPatch(sh, uni) {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', TREE_HEAD)
      .replace('#include <beginnormal_vertex>', 'vec2 bdv = cameraPosition.xz - iA.xz; vec2 bdd = length(bdv) > 0.01 ? normalize(bdv) : vec2(0.0, 1.0); vec3 brt = vec3(bdd.y, 0.0, -bdd.x);\nvec3 objectNormal = normalize(brt * position.x * 1.1 + vec3(0.0, 0.45 + position.y * 0.7, 0.0) + vec3(bdd.x, 0.0, bdd.y) * 0.35);')
      .replace('#include <begin_vertex>', 'vec3 transformed = iA.xyz + brt * position.x * iB.x * 0.95 + vec3(0.0, position.y * iB.y, 0.0);\nfloat dE = distance(iA.xz, uEye.xz); if (dE < uLod.x || dE >= uLod.y) transformed = iA.xyz;\nvTint = iC.rgb;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv = (uv * vec2(0.98, 0.985) + vec2(0.01, 0.004) + vec2(iB.z, iB.w)) * vec2(0.25, 1.0 / 3.0);\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTint;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vTint;');
    Env.noFlip(sh);
  }

  // ---------------------------------------------------------------- placement
  Veg.build = function (E) {
    const sc = E.sc, t = E.t, OCC = Env.OCC, rng = U.rng(2024); const trees = []; const T0 = performance.now();
    const BLOCK = OCC.ROAD | OCC.BUILT | OCC.PARK | OCC.WATER | OCC.KEEP;
    const ok = (x, z, w, extraMask) => {
      if (Math.abs(x) > 2350 || Math.abs(z) > 2350) return true;
      if (E.occAt(x, z) & (BLOCK | (extraMask || 0))) return false;
      return E.fAt(x, z) > w * 0.5 + 3;
    };
    const add = (x, z, sp, w, h, variant, tint, interior) => { trees.push([x, z, sp, w, h, variant == null ? (rng() < 0.5 ? 0 : 1) : variant, tint == null ? rng() : tint, interior ? 1 : 0]); };
    const oakSize = (k) => { const s = 0.75 + rng() * 0.5; return [11 * s * (k || 1), 13.5 * s * (k || 1)]; };
    // ---- woodland blocks: dense along the edge (closed canopy wall), lighter inside
    const woods = t.data.scenery.woods.concat(E.data.woods || []); E.allWoods = woods;
    // tree-line strips standing in for the billboards beyond the far LOD radius (medium / low): [points, height]
    const inner = E.innerStrips = []; const H = Env.CARD_HALF;
    for (const w of woods) if (Math.abs(U.polyArea(w)) >= 150) inner.push([w.concat([w[0]]), 17]);
    let nWood = 0;
    for (const w of woods) {
      const b = U.polyBounds(w); const area = Math.abs(U.polyArea(w)); if (area < 150) continue;
      const step = 5.2;
      for (let z = b.z0; z <= b.z1; z += step) for (let x = b.x0 + ((Math.round(z / step) & 1) ? step / 2 : 0); x <= b.x1; x += step) {
        const px = x + (rng() - 0.5) * step * 0.9, pz = z + (rng() - 0.5) * step * 0.9; if (!U.pointInPoly(px, pz, w)) continue;
        const de = E.distToPoly(px, pz, w); const p = de < 9 ? 1 : de < 22 ? 0.4 : 0.17; if (rng() > p) continue;
        const k = rng(); let sp = SP.OAK, wd, ht;
        if (de < 4 && k < 0.4) { sp = SP.SHRUB; wd = 4 + rng() * 3; ht = 3 + rng() * 2.5; }
        else if (k < 0.1) { sp = SP.PINE; wd = 8 + rng() * 3; ht = 16 + rng() * 6; }
        else if (k < 0.15) { sp = SP.POPLAR; wd = 5 + rng() * 2; ht = 18 + rng() * 6; }
        else { [wd, ht] = oakSize(1.05); }
        if (!ok(px, pz, wd * 0.6)) continue; add(px, pz, sp, wd, ht, null, null, de > 10); nWood++;
      }
    }
    // ---- copses in a few far fields
    let nCopse = 0;
    for (const [k, poly] of E.fieldPolys || []) {
      if (E.fType[k] !== 8) continue; const sx = E.seedX[k], sz = E.seedZ[k]; if (E.isVenue(sx, sz) || Math.max(Math.abs(sx), Math.abs(sz)) > Env.CARD_HALF) continue; const R = 45 + E.fTone[k] * 35;
      { const ring = []; for (let a = 0; a <= 12; a++) ring.push([sx + Math.cos(a / 12 * 6.283) * R * 1.1, sz + Math.sin(a / 12 * 6.283) * R * 0.8]); inner.push([ring, 14]); }
      for (let i = 0; i < R * R * 0.032; i++) { const a = rng() * 6.283, d = Math.sqrt(rng()) * R; const x = sx + Math.cos(a) * d * 1.2, z = sz + Math.sin(a) * d * 0.85; const [wd, ht] = oakSize(); if (!ok(x, z, wd)) continue; add(x, z, rng() < 0.15 ? SP.PINE : SP.OAK, wd, ht); nCopse++; }
    }
    // ---- hedgerows along the field boundaries (outside the venue): shrubs every ~3 m, standard oaks, some poplar rows and tree lines
    const seen = new Set(); let nHedge = 0; const hc = {};
    for (const [k, poly] of E.fieldPolys || []) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length]; const key = Math.round((a[0] + b[0]) / 4) + ',' + Math.round((a[1] + b[1]) / 4); if (seen.has(key)) continue; seen.add(key);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 2) continue; if (!E.hedgeOn(a, b, hc)) continue; const h = Env.hash2(Math.round(a[0]), Math.round(b[1]), 77);
        const style = h < 0.05 ? 'poplar' : h < 0.3 ? 'trees' : h < 0.9 ? 'hedge' : 'none'; if (style === 'none') continue;
        const gate = rng() * L, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; const fMid = E.fAt(mx, mz);
        if ((Math.abs(a[0]) < H && Math.abs(a[1]) < H) || (Math.abs(b[0]) < H && Math.abs(b[1]) < H)) if (!E.isVenue(mx, mz)) inner.push([[a, b], style === 'poplar' ? 19 : style === 'trees' ? 12 : 6]);
        const dense = fMid < 950; const spacing = style === 'poplar' ? 7 : dense ? 4.2 : 26;
        for (let s = spacing * rng(); s < L; s += spacing * (0.8 + rng() * 0.4)) {
          if (Math.abs(s - gate) < 6) continue; const u = s / L; const x = a[0] + (b[0] - a[0]) * u + (rng() - 0.5) * 1.2, z = a[1] + (b[1] - a[1]) * u + (rng() - 0.5) * 1.2;
          if (Math.abs(x) > H || Math.abs(z) > H) continue; if (E.isVenue(x, z)) continue;
          if (style === 'poplar') { if (!ok(x, z, 6, OCC.WOOD)) continue; add(x, z, SP.POPLAR, 4.5 + rng() * 2, 17 + rng() * 7); nHedge++; continue; }
          const std = !dense || rng() < (style === 'trees' ? 0.3 : 0.07);
          if (std) { const [wd, ht] = oakSize(); if (!ok(x, z, wd * 0.5, OCC.WOOD)) continue; add(x, z, rng() < 0.85 ? SP.OAK : SP.PINE, wd, ht); }
          else { if (!ok(x, z, 4, OCC.WOOD)) continue; add(x, z, SP.SHRUB, 4.6 + rng() * 2.4, 2.5 + rng() * 1.6); }
          nHedge++;
        }
      }
    }
    // ---- roadside hedges and trees: public roads everywhere, and close to the circuit (within ~700 m of the barriers) a dense
    // double hedgerow with standard oaks along every road, the estate service roads included
    let nRoad = 0;
    for (const r of E.roads || []) {
      const pts = r.line; const pub = r.kind === 'public';
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue; const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        const fm = E.fAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); const close = fm < 700 && fm > 25;
        if ((!pub && !close) || r.name === 'infield') continue;
        const rows = close && r.name !== 'perimeter' ? 2 : 1; const step = close ? (rows > 1 ? 2.3 : 3.0) : 3.4; let segRun = null;
        for (const sd of [-1, 1]) {
          const gap = rng() * L; segRun = [];
          for (let s = rng() * step; s < L; s += step * (0.85 + rng() * 0.3)) {
            if (close && Math.abs(s - gap) < 5 && rng() < 0.7) continue;
            for (let row = 0; row < rows; row++) {
              const off = r.w / 2 + 3.8 + row * 1.7 + rng() * 0.8; const sj = s + row * step * 0.5; if (sj > L) continue;
              const x = a[0] + (b[0] - a[0]) * sj / L + nx * sd * off, z = a[1] + (b[1] - a[1]) * sj / L + nz * sd * off;
              if (Math.abs(x) > H || Math.abs(z) > H || (!close && E.isVenue(x, z))) continue; const std = row === 0 && rng() < (close ? 0.12 : 0.08);
              if (std) { const [wd, ht] = oakSize(); if (!ok(x, z, 6, OCC.WOOD)) continue; add(x, z, rng() < 0.9 ? SP.OAK : SP.POPLAR, wd, ht); } else { if (!ok(x, z, 4, OCC.WOOD)) continue; add(x, z, SP.SHRUB, 3.4 + rng() * 2.2, 2.4 + rng() * 1.6); }
              if (row === 0) segRun.push([x, z]); nRoad++;
            }
          }
          if (segRun.length > 3) for (let k = 0; k + 1 < segRun.length; k += 6) inner.push([segRun.slice(k, k + 7), close ? 6 : 4]);
        }
      }
    }
    // ---- tree lines behind the grandstands and along the outside of the perimeter fence
    let nLine = 0;
    for (const [x0, z0, x1, z1] of E.treeLines || []) {
      const L = Math.hypot(x1 - x0, z1 - z0); inner.push([[[x0, z0], [x1, z1]], 13]);
      for (let s = rng() * 5; s < L; s += 6 + rng() * 5) { const u = s / L; const x = x0 + (x1 - x0) * u + (rng() - 0.5) * 2, z = z0 + (z1 - z0) * u + (rng() - 0.5) * 2; const kind = rng(); const pop = kind < 0.1; const [wd, ht] = pop ? [4.5 + rng() * 2, 16 + rng() * 6] : oakSize(); if (!ok(x, z, wd)) continue; add(x, z, pop ? SP.POPLAR : SP.OAK, wd, ht); nLine++; }
    }
    // ---- scattered clumps around the estate (between stands, car parks and roads)
    let nClump = 0;
    for (let c = 0; c < 900 && nClump < 2400; c++) {
      const s = rng() * t.length, side = rng() < 0.55 ? 1 : -1; const i = t.idxAtS(s); const d = E.wallCap(i, side) + 18 + rng() * 170;
      const cx = t.x[i] + t.nx[i] * side * d, cz = t.z[i] + t.nz[i] * side * d; if (!E.isVenue(cx, cz) || E.occAt(cx, cz)) continue;
      const nn = 2 + Math.floor(rng() * 6);
      for (let k = 0; k < nn; k++) { const x = cx + (rng() - 0.5) * 26, z = cz + (rng() - 0.5) * 26; const sp = rng() < 0.05 ? SP.POPLAR : rng() < 0.2 ? SP.SHRUB : SP.OAK; const [wd, ht] = sp === SP.POPLAR ? [4.5, 17 + rng() * 5] : sp === SP.SHRUB ? [4 + rng() * 2, 3 + rng() * 1.5] : oakSize(0.9); if (!ok(x, z, wd + 2)) continue; add(x, z, sp, wd, ht); nClump++; }
    }
    E.stats.trees = { wood: nWood, copse: nCopse, hedge: nHedge, road: nRoad, lines: nLine, clumps: nClump, total: trees.length };
    sc.treeCount = trees.length;
    Veg.instance(E, trees);
    Veg.strips(E);
    E.timings.trees = Math.round(performance.now() - T0);
  };

  // ---------------------------------------------------------------- instancing: one cell-sorted record set feeding the near (3-card) LOD,
  // the soft contact shadows under near trees and the far (1-card billboard) LOD; both regathered around the eye
  Veg.instance = function (E, trees) {
    const sc = E.sc; const atlas = paintAtlas(); const rng = U.rng(99);
    const set = new Env.CellSet([4, 4, 4], 60);
    for (const tr of trees) {
      const [x, z, sp, w, h, v, tint, interior] = tr; const y = sc.height(x, z) - 0.15;
      const br = 0.82 + tint * 0.3; const warm = (rng() - 0.5) * 0.12; const yaw = rng() * Math.PI;
      set.push(x, z, [[x, y, z, yaw], [w, h, sp, v], [br * (1 + warm), br, br * (1 - warm * 1.5), sp !== SP.SHRUB && !interior ? 1 : 0]]);
    }
    set.finalize(); const N = trees.length;
    const uni = { uEye: { value: new THREE.Vector3() }, uLodN: { value: new THREE.Vector2(0, 500) }, uLodF: { value: new THREE.Vector2(500, 1e5) } };
    // near
    const [ng, nattr] = Env.instGeo(treeGeometry(), ['iA', 'iB', 'iC'], N);
    const nmat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 });
    nmat.onBeforeCompile = (sh) => nearPatch(sh, { uEye: uni.uEye, uLod: uni.uLodN }); nmat.customProgramCacheKey = () => 'tree-near';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.42 });
    depth.onBeforeCompile = (sh) => nearPatch(sh, { uEye: uni.uEye, uLod: uni.uLodN }, true); depth.customProgramCacheKey = () => 'tree-near-depth';
    const near = new THREE.Mesh(ng, nmat); near.frustumCulled = false; near.customDepthMaterial = depth; near.name = 'trees'; sc.group.add(near);
    // contact shadows share the near records: a flat quad pushed away from the sun (azimuth 205, elevation 42); shrubs and wood interiors have none
    const [bc, bctx] = Env.canvas(128, 128); const gr = bctx.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); bctx.fillStyle = gr; bctx.fillRect(0, 0, 128, 128);
    const bbase = new THREE.PlaneGeometry(1, 1); bbase.rotateX(-Math.PI / 2);
    const bg = new THREE.InstancedBufferGeometry(); bg.index = bbase.index; for (const k in bbase.attributes) bg.setAttribute(k, bbase.attributes[k]); ['iA', 'iB', 'iC'].forEach((k, j) => bg.setAttribute(k, nattr[j])); bg.instanceCount = 0;
    const bmat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), color: 0x16200f, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    bmat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uEye: uni.uEye, uLod: uni.uLodN });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', TREE_HEAD).replace('#include <begin_vertex>', [
        'float off = min(iB.y * 0.32, 6.0); const vec2 sd = vec2(0.42, 0.91);',
        'vec2 lp = vec2(position.x * iB.x * 1.1, position.z * (iB.x * 1.1 + iB.y * 0.3));',
        'vec3 transformed = vec3(iA.x + sd.x * off + lp.x * sd.y + lp.y * sd.x, iA.y + 0.25, iA.z + sd.y * off - lp.x * sd.x + lp.y * sd.y);',
        'float dE = distance(iA.xz, uEye.xz); if (iC.w < 0.5 || dE >= uLod.y) transformed = iA.xyz; vTint = iC.rgb;'].join('\n'));
    };
    bmat.customProgramCacheKey = () => 'tree-blob';
    const blobs = new THREE.Mesh(bg, bmat); blobs.frustumCulled = false; blobs.name = 'treeShadows'; blobs.renderOrder = 1; sc.group.add(blobs);
    // far
    const fbase = new THREE.PlaneGeometry(1, 1); fbase.translate(0, 0.5, 0);
    const [fg, fattr] = Env.instGeo(fbase, ['iA', 'iB', 'iC'], N);
    const fmat = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    fmat.onBeforeCompile = (sh) => farPatch(sh, { uEye: uni.uEye, uLod: uni.uLodF }); fmat.customProgramCacheKey = () => 'tree-far';
    const far = new THREE.Mesh(fg, fmat); far.frustumCulled = false; far.name = 'treesFar'; sc.group.add(far);
    const dn = new Env.DynSet(set, nattr, (n) => { ng.instanceCount = n; bg.instanceCount = n; near.visible = n > 0; blobs.visible = n > 0 && sc.treeBlobs !== false; }, 25);
    const df = new Env.DynSet(set, fattr, (n) => { fg.instanceCount = n; far.visible = n > 0; }, 90);
    sc.treeLod = {
      near, far, blobs, uni,
      // nearR: 3-card trees inside; farR: billboards out to here (nothing beyond)
      setRange(nearR, farR) { this.nearR = nearR; this.farR = farR; uni.uLodN.value.set(0, nearR); uni.uLodF.value.set(nearR, farR); dn.range(0, nearR + 60); df.range(Math.max(0, nearR - 160), farR + 160); },
      update(x, z) { uni.uEye.value.set(x, 0, z); dn.update(x, z); df.update(x, z); },
      get counts() { return { near: dn.n, far: df.n }; },
    };
    sc.treeLod.setRange(500, 1e5);
    sc.treeMat = nmat;
  };

  // ---------------------------------------------------------------- distant tree-line strips: hedgerow trees and woods beyond the field map, out to the horizon
  function stripTexture() {
    const W = 1024, Hh = 128; const [c, ctx] = Env.canvas(W, Hh); ctx.clearRect(0, 0, W, Hh); const r = U.rng(321);
    const greens = [[30, 40, 22], [40, 52, 28], [50, 64, 34], [36, 46, 26], [60, 74, 40]];
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 70; i++) {
      const x = r() * W, h = (pass ? 40 : 60) + r() * (pass ? 40 : 60), w = 24 + r() * 46; const g = greens[Math.floor(r() * greens.length)];
      for (let k = 0; k < 220; k++) {
        const a = r() * 6.283, d = Math.sqrt(r()); const px = x + Math.cos(a) * d * w, py = Hh - h * 0.55 + Math.sin(a) * d * h * 0.55; const lit = U.clamp(0.55 - Math.sin(a) * d * 0.5, 0, 1) * (0.7 + 0.5 * r());
        ctx.fillStyle = 'rgb(' + (g[0] * (0.6 + lit) | 0) + ',' + (g[1] * (0.6 + lit) | 0) + ',' + (g[2] * (0.6 + lit) | 0) + ')';
        for (const ox of [-W, 0, W]) { ctx.beginPath(); ctx.arc(px + ox, Math.min(py, Hh - 2), 3 + r() * 4, 0, 6.283); ctx.fill(); }
      }
    }
    ctx.fillStyle = 'rgb(26,34,20)'; ctx.fillRect(0, Hh - 14, W, 14);
    const t = Env.cutout(c, { repeat: true }); t.wrapT = THREE.ClampToEdgeWrapping; return t;
  }
  Veg.strips = function (E) {
    const sc = E.sc, rng = U.rng(555); const pos = [], uv = [], nrm = [], idx = []; const H = Env.CARD_HALF;
    const strip = (pts, hgt) => {
      let v0 = pos.length / 3, u = rng() * 8;
      for (let i = 0; i < pts.length; i++) {
        const [x, z] = pts[i]; const y = E.terrainHeight(x, z) - 1.2; const hh = hgt * (0.8 + 0.4 * U.noise2(x / 90, z / 90));
        if (i > 0) u += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]) / (hgt * 6);
        pos.push(x, y, z, x, y + hh, z); uv.push(u, 0, u, 1); nrm.push(0, 1, 0, 0, 1, 0);
        if (i > 0) { const a = v0 + (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
    };
    // field boundaries outside the map: about a third carry a hedgerow tree line
    let edges = 0; const R = E.FR, W = E.FW; const seen = new Set(); const hc = {};
    for (let k = 0; k < W * W; k++) {
      const sx = E.seedX[k], sz = E.seedZ[k]; const r = Math.hypot(sx, sz); if (r > 5600) continue;
      const inMap = Math.abs(sx) < H - 60 && Math.abs(sz) < H - 60; if (inMap) continue;
      const poly = E.fieldPoly(k); const wood = E.fType[k] === 8;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length]; const key = Math.round((a[0] + b[0]) / 4) + ',' + Math.round((a[1] + b[1]) / 4); if (seen.has(key) && !wood) continue; seen.add(key);
        if (!wood && (Env.hash2(Math.round(a[0]), Math.round(b[1]), 91) > 0.4 || !E.hedgeOn(a, b, hc))) continue;
        if (Math.max(Math.abs(a[0]), Math.abs(a[1])) < H && Math.max(Math.abs(b[0]), Math.abs(b[1])) < H) continue;
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(L / 22)); const pts = [];
        for (let j = 0; j <= n; j++) pts.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
        strip(pts, wood ? 20 : 11 + rng() * 5); edges++;
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setIndex(idx); geo.computeBoundingSphere();
    const stex = stripTexture();
    const mat = new THREE.MeshStandardMaterial({ map: stex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
    mat.onBeforeCompile = Env.noFlip;
    const m = new THREE.Mesh(geo, mat); m.name = 'treeStrips'; sc.group.add(m); E.stats.stripEdges = edges; E.stats.stripTris = idx.length / 3;
    // inner strips (woods edges, copses, hedgerows, tree lines and road hedges inside the billboard area): shown only by the
    // medium / low tiers, where they grow out of the ground beyond the far tree radius (uStripR) and replace the culled billboards
    const ip = [], iu = [], inr = [], ib = [], ii = [];
    for (const [line, hgt] of E.innerStrips || []) {
      const pts = []; for (let k = 0; k + 1 < line.length; k++) { const a = line[k], b = line[k + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(L / 20)); for (let j = 0; j < n; j++) pts.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]); } pts.push(line[line.length - 1]);
      if (pts.length < 2) continue; let v0 = ip.length / 3, u = rng() * 8;
      for (let i = 0; i < pts.length; i++) {
        const [x, z] = pts[i]; const y = sc.height(x, z) - 0.6; const hh = hgt * (0.8 + 0.4 * U.noise2(x / 70, z / 70));
        if (i > 0) u += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]) / (hgt * 6);
        ip.push(x, y, z, x, y + hh, z); iu.push(u, 0, u, 1); inr.push(0, 1, 0, 0, 1, 0); ib.push(y, y);
        if (i > 0) { const a = v0 + (i - 1) * 2; ii.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
    }
    if (ii.length) {
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(ip, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(iu, 2)); g2.setAttribute('normal', new THREE.Float32BufferAttribute(inr, 3)); g2.setAttribute('sBase', new THREE.Float32BufferAttribute(ib, 1)); g2.setIndex(ii); g2.computeBoundingSphere();
      const uni = { uEye: { value: new THREE.Vector3() }, uStripR: { value: 1500 } };
      const m2mat = new THREE.MeshStandardMaterial({ map: stex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
      m2mat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, uni); Env.noFlip(sh); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float sBase;\nuniform vec3 uEye;\nuniform float uStripR;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y = mix(sBase - 0.5, transformed.y, smoothstep(uStripR - 30.0, uStripR + 50.0, distance(position.xz, uEye.xz)));'); };
      m2mat.customProgramCacheKey = () => 'tree-strips-inner';
      const m2 = new THREE.Mesh(g2, m2mat); m2.name = 'treeStripsNear'; m2.visible = false; sc.group.add(m2); sc.innerStrips = { mesh: m2, uni }; E.stats.innerStripTris = ii.length / 3;
    }
  };

  // ---------------------------------------------------------------- verge grass cards: tufts 3-30 m from the track edge, shown around the camera only
  // near-neutral blades (the instance colour, sampled from the ground under each tuft, supplies the green)
  function grassCardTexture() {
    const [c, ctx] = Env.canvas(256, 128); ctx.clearRect(0, 0, 256, 128); const r = U.rng(808);
    for (let i = 0; i < 420; i++) {
      const x = 4 + r() * 248, h = 34 + r() * 90 * (0.4 + 0.6 * Math.sin(Math.PI * x / 256)), lean = (r() - 0.5) * 46, w = 0.9 + r() * 1.6; const k = r();
      const base = k < 0.12 ? [150, 150, 120] : k < 0.85 ? [205, 215, 190] : [245, 238, 200]; const lo = 0.62 + r() * 0.2;
      const g = ctx.createLinearGradient(0, 128, 0, 128 - h); g.addColorStop(0, 'rgb(' + (base[0] * lo | 0) + ',' + (base[1] * lo | 0) + ',' + (base[2] * lo | 0) + ')'); g.addColorStop(1, 'rgb(' + base[0] + ',' + base[1] + ',' + base[2] + ')');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w, 128); ctx.quadraticCurveTo(x - w * 0.3 + lean * 0.4, 128 - h * 0.55, x + lean, 128 - h); ctx.quadraticCurveTo(x + w * 0.3 + lean * 0.4, 128 - h * 0.55, x + w, 128); ctx.closePath(); ctx.fill();
    }
    return Env.cutout(c, { aniso: 4 });
  }
  Veg.buildGrass = function (E) {
    const sc = E.sc, t = E.t, rng = U.rng(4040), hw = t.halfWidth, kw = t.kerbWidth; const OCC = Env.OCC;
    // candidate tufts, cell-sorted: a ready instance matrix + colour each (the regather around the eye is then a few block copies)
    const set = new Env.CellSet([16, 3], 32); let total = 0; const col = new THREE.Color();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const push = (x, y, z, s) => { E.mapColor(x, z, col); const k = 1.45 + rng() * 0.45; p.set(x, y, z); q.setFromAxisAngle(up, rng() * Math.PI); sv.set(s, s * (0.8 + (total % 5) * 0.1), s); m.compose(p, q, sv); set.push(x, z, [m.elements, [col.r * k * 1.1, col.g * k * 1.04, col.b * k]]); total++; };
    for (let i = 0; i < t.n; i++) {
      for (const side of [-1, 1]) {
        const run = side < 0 ? t.runoffL[i] : t.runoffR[i], grav = side < 0 ? t.gravelL[i] : t.gravelR[i];
        const wall = E.wallCap(i, side); const inner0 = hw + kw + 2.6; const runEnd = run ? Math.min(hw + kw + (grav ? 7 : 14), wall - 0.4) + 0.8 : inner0; const lim = grav ? wall + 1 : runEnd;
        // inside the barrier (grass between run-off and wall), then outside the fence out to ~30 m
        const spans = [[Math.max(inner0, lim), wall - 0.7], [wall + 2.8, wall + 30]];
        for (const [a, b] of spans) {
          if (b - a < 0.8) continue; const n = Math.round((b - a) * t.ds * 0.42);
          for (let k = 0; k < n; k++) {
            const d = a + Math.pow(rng(), 1.4) * (b - a); const along = (rng() - 0.5) * t.ds; const x = t.x[i] + t.nx[i] * side * d + t.tx[i] * along, z = t.z[i] + t.nz[i] * side * d + t.tz[i] * along;
            if (d > wall && (E.occAt(x, z) & (OCC.ROAD | OCC.BUILT | OCC.WATER | OCC.PARK))) continue;
            if (d > wall && E.fsAt(x, z) < 2.0) continue; // another part of the track
            push(x, t.y[i] - 0.03, z, 0.6 + rng() * 0.7);
          }
        }
      }
    }
    set.finalize();
    const MAX = 22000; const geo = new THREE.BufferGeometry();
    const pos = [], uv = [], nrm = [];
    for (const [ax, az] of [[1, 0], [0.5, 0.866], [-0.5, 0.866]]) { const w = 0.55; for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) { pos.push(ax * (u - 0.5) * 2 * w, v * 0.34, az * (u - 0.5) * 2 * w); uv.push(u, v); nrm.push(0, 1, 0); } }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const mat = new THREE.MeshStandardMaterial({ map: grassCardTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
    const uniforms = { gTime: { value: 0 }, gCam: { value: new THREE.Vector3() }, gFade: { value: new THREE.Vector2(55, 85) }, gTint: { value: new THREE.Vector3(1, 1, 1) } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms); Env.noFlip(sh);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float gTime;\nuniform vec3 gCam;\nuniform vec2 gFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nvec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);\nfloat fade = (1.0 - smoothstep(gFade.x, gFade.y, distance(ip.xz, gCam.xz))) * (1.0 - smoothstep(7.0, 16.0, cameraPosition.y - ip.y));\ntransformed *= fade;\ntransformed.x += sin(gTime * 1.7 + ip.x * 0.35 + ip.z * 0.21) * 0.07 * uv.y;\ntransformed.z += cos(gTime * 1.3 + ip.z * 0.31) * 0.05 * uv.y;\n#endif');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 gTint;').replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= gTint;');
    };
    mat.customProgramCacheKey = () => 'grass-cards';
    const cap = Math.min(MAX, total);
    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, cap)); inst.setColorAt(0, new THREE.Color(1, 1, 1)); inst.count = 0; inst.frustumCulled = false; inst.name = 'grassCards';
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage); inst.instanceColor.setUsage(THREE.DynamicDrawUsage);
    sc.group.add(inst);
    E.stats.grassCandidates = total;
    // the set is gathered into a scratch buffer and clipped to the capacity (nearest cells first is not needed: the radius keeps it small)
    const scratch = [new Float32Array(total * 16), new Float32Array(total * 3)];
    let last = null, R = 85, on = true;
    sc.grass = {
      inst, uniforms,
      setRange(fade0, fade1) { on = fade1 > 0; R = fade1; if (on) uniforms.gFade.value.set(fade0, fade1); last = null; inst.visible = on; },
      update(dt, cx, cz) {
        uniforms.gTime.value += dt; uniforms.gCam.value.set(cx, 0, cz); const tn = sc.grassTint; if (tn) uniforms.gTint.value.set(tn[0], tn[1], tn[2]);
        if (!on || (last && Math.hypot(cx - last[0], cz - last[1]) < 12)) return; last = [cx, cz];
        let n = set.gather(cx, cz, 0, R + 16, scratch); n = Math.min(n, cap);
        inst.instanceMatrix.array.set(scratch[0].subarray(0, n * 16)); inst.instanceColor.array.set(scratch[1].subarray(0, n * 3));
        inst.count = n; for (const [a, st] of [[inst.instanceMatrix, 16], [inst.instanceColor, 3]]) { a.updateRange.offset = 0; a.updateRange.count = Math.max(1, n * st); a.needsUpdate = true; }
      },
    };
  };

  EI.EnvVeg = Veg;
})();
