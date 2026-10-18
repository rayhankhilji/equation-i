// Equation I - Yas Island buildings round the circuit (kind 'desert'): every OpenStreetMap footprint that no landmark builder owns
// becomes a building in the Gulf's idiom instead of a plain box - cream stone hotels and apartment blocks with deep, partly lit
// windows (the Rotana, Crowne Plaza, Radisson, Park Inn and Staybridge on the west side), glass office towers, low white blocks
// with window strips and sun screens for the service and venue buildings. Lobby floors glow, roofs get parapets and plant, the tall
// ones a lit crown and red aircraft lights. All of it is written into the landmarks' static batch (one mesh, one draw call).
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const C = (h) => new THREE.Color(h).convertSRGBToLinear();
  const City = {};
  const isNight = () => !!(EI.Night && EI.Night.on);
  const glow = (p, size, col, opts) => { if (isNight()) EI.Night.addGlow(p[0], p[1], p[2], size, col, opts); };
  const area = (p) => Math.abs(U.polyArea(p));
  const cen = (p) => { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; };
  // outward normal of edge a-b (the footprint may wind either way)
  function outN(p, a, b) { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l; if (U.pointInPoly((a[0] + b[0]) / 2 + nx * 0.3, (a[1] + b[1]) / 2 + nz * 0.3, p)) { nx = -nx; nz = -nz; } return [nx, nz]; }
  // a band of walls between ya and yb, textured from v0 (metres into the tile) with tile size tu x tv; one face, outward
  function band(B, p, ya, yb, tu, tv, v0, col) {
    let u = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.05) continue; const [nx, nz] = outN(p, a, b);
      // whole bays per edge, so a pane never splits at a corner
      const u0 = u / tu, u1 = (u + l) / tu, va = v0 / tv, vb = (v0 + yb - ya) / tv;
      const A = [a[0], ya, a[1]], Bq = [b[0], ya, b[1]], Cq = [b[0], yb, b[1]], D = [a[0], yb, a[1]];
      // orientation: quad(A, B, C, D) faces (B-A) x (D-A); flip when that points inwards
      const ux = b[0] - a[0], uz = b[1] - a[1]; const cx = -uz, cz = ux;   // (B-A) x up, horizontal part, sign-flipped by the cross order
      if (cx * nx + cz * nz >= 0) B.quad(A, Bq, Cq, D, col, [u0, va, u1, va, u1, vb, u0, vb]); else B.quad(A, D, Cq, Bq, col, [u0, va, u0, vb, u1, vb, u1, va]);
      u += Math.ceil(l / (tu / 6)) * (tu / 6);
    }
  }
  function roof(B, p, y, col) {
    let tri; try { tri = THREE.ShapeUtils.triangulateShape(p.map(q => new THREE.Vector2(q[0], q[1])), []); } catch (e) { return; }
    for (const [a, b, c] of tri) { const A = [p[a][0], y, p[a][1]], Bq = [p[b][0], y, p[b][1]], Cq = [p[c][0], y, p[c][1]];
      const ny = (Bq[2] - A[2]) * (Cq[0] - A[0]) - (Bq[0] - A[0]) * (Cq[2] - A[2]); if (ny > 0) B.tri(A, Bq, Cq, col); else B.tri(A, Cq, Bq, col); }
  }
  // inset ring (for parapets): each vertex moved inwards by d along the bisector, clamped
  function inset(p, d) {
    const n = p.length; const out = [];
    for (let i = 0; i < n; i++) {
      const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
      const [n1x, n1z] = outN(p, a, b), [n2x, n2z] = outN(p, b, c); let bx = n1x + n2x, bz = n1z + n2z; const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
      const k = Math.min(3, 1 / Math.max(0.35, bx * n1x + bz * n1z)); out.push([b[0] - bx * d * k, b[1] - bz * d * k]);
    }
    return out;
  }
  function kindOf(b, a) {
    const n = (b.n || '') + ' ' + (b.k || '');
    if (/hotel|rotana|crowne|radisson|park inn|staybridge|centro|hilton|marriott|yas plaza/i.test(n)) return 'hotel';
    const h = b.h || 0;
    if (h >= 30) return a > 3000 ? 'hotel' : 'tower';
    if (/apartments|residential/.test(b.k || '') || (h >= 14 && a < 4000)) return 'hotel';
    if (h >= 14) return 'tower';
    return 'low';
  }

  City.build = function (E, H, out) {
    const list = E.sc._yasGeneric || []; if (!list.length) return; const T = EI.EnvYasTex.regions(); const SK = EI.StreetKit;
    const B = new SK.Batch(); const night = isNight(); const rng = U.rng(9091);
    const pr = {}; const t = E.t; let n = 0, crowns = 0;
    const roofC = C(0xb9b6ae), parC = C(0xf2efe8), plant = C(0x8e9398), white = C(0xffffff);
    for (const b of list) {
      const p = b.p; if (!p || p.length < 3) continue; const a = area(p); if (a < 40) continue;
      let clear = true, y0 = Infinity; for (const q of p) { t.project(q[0], q[1], null, pr); if (pr.dist < Math.max(t.wallL[pr.i], t.wallR[pr.i]) + 1) { clear = false; break; } y0 = Math.min(y0, E.ground(q[0], q[1])); }
      if (!clear || !isFinite(y0)) continue; y0 -= 0.3;
      const kind = kindOf(b, a);
      let h = b.h || 0; if (!h) h = kind === 'low' ? (a > 2500 ? 9 + Math.min(6, a / 3000) : a > 400 ? 6 + Math.min(4, a / 500) : 3.6 + Math.min(2.4, a / 120)) : 18;
      h = Math.min(h, 90);
      const top = y0 + h;
      if (kind === 'hotel') {
        // a double-height lit lobby, then the stone facade floors, a cornice and a parapet
        const lob = Math.min(6.6, h * 0.25);
        B.set(T.hosp, 0.2, 0.2, night ? 0.9 : 0); band(B, p, y0, y0 + lob, 12, 14.4, 9.6, white);
        B.set(T.stoneH, 0.8, 0, night ? 0.85 : 0); band(B, p, y0 + lob, top, 16, 13.2, 0, C(rng() < 0.5 ? 0xffffff : 0xf3e9da));
      } else if (kind === 'tower') {
        const lob = Math.min(5, h * 0.2);
        B.set(T.hosp, 0.2, 0.2, night ? 0.9 : 0); band(B, p, y0, y0 + lob, 12, 14.4, 9.6, white);
        B.set(T.office, 0.12, 0.5, night ? 0.85 : 0); band(B, p, y0 + lob, top, 7.5, 14.4, 0, white);
      } else {
        B.set(T.white, 0.75, 0, night ? 0.7 : 0); band(B, p, y0, top, 12, 7, h < 5 ? 3.5 : 0, C(rng() < 0.7 ? 0xffffff : 0xf0e6d6));
      }
      // roof: slab, parapet (1 m, white, both faces), plant on the bigger roofs
      const par = a > 120 ? 1.0 : 0; if (par) { B.set('white', 0.8, 0, 0); band(B, p, top, top + par, 8, 8, 0, parC); }
      B.set('white', 0.85, 0, 0); roof(B, p, top + par, roofC);
      if (a > 600) { const c = cen(p); const m = new THREE.Matrix4().makeTranslation(c[0], top, c[1]); const k = Math.min(3, Math.floor(a / 900) + 1); B.set('white', 0.6, 0.4, 0); for (let i = 0; i < k; i++) B.box(m, 3 + rng() * 4, 1.6 + rng() * 1.4, 2.5 + rng() * 3, (rng() - 0.5) * Math.sqrt(a) * 0.4, 0, (rng() - 0.5) * Math.sqrt(a) * 0.4, plant); }
      // tall buildings: a lit crown band just under the roof, a red aircraft light on the corners
      if (h >= 28 && night) {
        B.set('white', 0.5, 0, 1.4); band(B, p, top - 1.4, top - 0.6, 8, 8, 0, kind === 'tower' ? C(0xbfe2ff) : C(0xffe2b8)); crowns++;
        for (let i = 0; i < p.length; i += Math.max(1, Math.floor(p.length / 3))) glow([p[i][0], top + 1.4, p[i][1]], 1.4, [1.0, 0.12, 0.08], { pulse: 0.45 });
      }
      n++;
    }
    H.W.add(B, 'main'); out.city = { buildings: n, crowns, tris: Math.round(B.count / 3) };
  };
  EI.EnvYasCity = City;
})();
