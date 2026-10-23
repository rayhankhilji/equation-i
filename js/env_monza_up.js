// Equation I - Monza photo-match pass (MONZA-UPGRADE, WAVE 9; refs: staging/monza_refs/photos, 35 F1 photos 2023-25).
// Monza-gated hooks only (track id 'monza'); every other circuit runs the shared code untouched. Loaded after the other env files.
//   * the park's trees: deep olive crowns, dark bark (data.treeTint on the tree materials)
//   * grandstands OSM misses: Lesmo 2 interno, the Parabolica outside through the exit (data.standsUp)
//   * the green standing boards on the verges of the long straights (data.vergeBoards; sign atlas + merged statics)
//   * surfaces: the 2024 resurfacing - near-black charcoal asphalt (data.asphaltTint, a material colour: no program / call change)
// All additions are uniform / vertex-colour changes or geometry merged into the scenery's existing statics (no new draw calls on Low).
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const isMonza = (t) => !!(t && t.data && t.data.id === 'monza');
  const MU = EI.MonzaUp = {};

  // ================================================================ the Royal Park's trees: deep olive-green crowns and dark bark (refs rolex_straight_alps_trees,
  // pirelli_wall_trees_grandstand, grandstand_crowd_italiangp_msc), not the lime / orange the grade made of the shared atlas: a material colour on the
  // tree meshes (data.treeTint, linear; near / far trees and the tree-line strips) - uniforms only
  if (EI.Scenery) {
    const oB = EI.Scenery.prototype.build;
    EI.Scenery.prototype.build = function () {
      const r = oB.apply(this, arguments);
      if (isMonza(this.track)) {
        try {
          const tt = this.track.data.treeTint; const g = this.group;
          if (tt && g) g.traverse(o => { if (o.isMesh && /^(trees|treesFar|treeStrips|treeStripsNear)$/.test(o.name) && o.material && o.material.color) o.material.color.setRGB(tt[0], tt[1], tt[2]); });
        } catch (e) { console.error('MonzaUp trees', e); }
      }
      return r;
    };
  }

  // ================================================================ grandstands the OSM footprints miss (js/env_monza_stands.js lays them out; the venue builds
  // tiers, fronts and the crowd): grandstand 10BIS on the inside of Lesmo 2 (refs2 lesmo_1-3; the stands file's own extra run is refused in
  // the build flow) and the long open terraces round the outside of the Parabolica through its exit (Tribuna 21 / 22, F1 photo
  // ferrari_banks_tifosi: a wall of tifosi along the whole corner). data.standsUp: [{ s0, s1, side (+1 left), gap, rows, label, seat }]
  const Mz = EI.EnvMonza;
  if (Mz && Mz.Stands) {
    const oL = Mz.Stands.layout;
    Mz.Stands.layout = function (E) {
      const r = oL.apply(this, arguments);
      try {
        const have = new Set((E.mzRuns || []).map(q => q.R.label || q.R.name)); let n = 0;
        for (const x of E.t.data.standsUp || []) {
          if (x.once && have.has(x.label)) continue;
          const run = Mz.Stands.run(E, { name: x.label, label: x.label, s0: x.s0, s1: x.s1, side: x.side, gapW: x.gap, rowsFix: x.rows, style: x.style || 'temp', seat: x.seat, maxRows: x.rows });
          n += run.blocks.length;
        }
        E.stats.monzaUpStands = n;
      } catch (e) { console.error('MonzaUp stands', e); }
      return r;
    };
  }

  // ================================================================ the green standing partner boards on the grass verges of the long straights (F1 photo
  // rolex_straight_alps_trees: A-frame boards every ~40 m both sides, angled to face the oncoming cars). Front faces in the venue's sign atlas
  // (the monzaSigns mesh: no new draw call), backs and legs vertex-coloured into the merged statics. data.vergeBoards: { runs: [[s0, s1], ...],
  // step, brand, bg }. Never in the drivable corridor: they stand just behind the barrier line and the catch fence (wall + 1.7 .. 2.3 m), away
  // from the kerb / run-off / gravel rows and the trackside furniture; their ground is marked BUILT so the park's trees keep off them.
  function vergeBoards(E, BK, out) {
    const t = E.t, VB = t.data.vergeBoards; if (!VB || !BK.A) return;
    const { B, A } = BK; const K = Mz.K, C = K.C; const OCC = EI.Env.OCC; const I4 = new THREE.Matrix4(); const rng = U.rng(4242);
    const r = A.region('mzUpVerge', 384, 160, (x2, w, h) => { x2.fillStyle = VB.bg || '#006039'; x2.fillRect(0, 0, w, h); x2.strokeStyle = 'rgba(255,255,255,0.18)'; x2.lineWidth = 4; x2.strokeRect(6, 6, w - 12, h - 12); if (EI.Ads && EI.Ads.drawPartner) EI.Ads.drawPartner(x2, VB.brand || 'rolex', w / 2, h / 2, w * 0.78, h * 0.62, { tone: 'white', fill: 0.5 }); });
    const back = C(0x1d4a33), leg = C(0x6c7176);
    const F = t.data.furniture || {}; const busy = [];
    for (const m of F.marshals || []) busy.push(m[0]); for (const c of F.cameraTowers || []) busy.push(c[0]); for (const q of F.scaffolds || []) busy.push(q); for (const q of F.billboards || []) busy.push(q); for (const q of F.cranes || []) busy.push(q);
    for (const sc of F.screens || []) busy.push(sc[0]); for (const q of F.gantries || []) busy.push(q); for (const q of F.bridges || []) busy.push(q[0]);
    const kk = t.smooth(t.k, 6); const hw = t.halfWidth, kw = t.kerbWidth; let n = 0; const step = VB.step || 40;
    for (const [s0, s1] of VB.runs || []) for (let s = s0; s < s1; s += step) for (const side of [-1, 1]) {
      const sb = s + (side > 0 ? step / 2 : 0) + (rng() - 0.5) * 6; if (sb > s1) continue;
      if (busy.some(q => Math.abs(U.mod(q - sb + t.length / 2, t.length) - t.length / 2) < 14)) continue;
      const i = t.idxAtS(sb); let bad = false; for (let d = -10; d <= 10; d += 2) { const j = t.idxAtS(sb + d); if (Math.abs(kk[j]) > 1 / 700 || t.runoffL[j] || t.runoffR[j] || t.gravelL[j] || t.gravelR[j]) bad = true; } if (bad) continue;
      const wall = side < 0 ? t.wallL[i] : t.wallR[i]; const lat = wall + 1.7 + rng() * 0.6; if (wall < hw + kw + 3) continue;
      const cx = t.x[i] + t.nx[i] * side * lat, cz = t.z[i] + t.nz[i] * side * lat; if (E.occAt(cx, cz) & (OCC.BUILT | OCC.ROAD)) continue;
      const yg = E.ground(cx, cz); if (!Number.isFinite(yg)) continue;
      // front normal: towards the oncoming cars, turned 46 deg towards the track
      const ca = Math.cos(0.8), sa = Math.sin(0.8); let fx = -t.tx[i] * ca - t.nx[i] * side * sa, fz = -t.tz[i] * ca - t.nz[i] * side * sa; const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl;
      const rx = fz, rz = -fx; const W = 2.6, H = 1.1, y0 = yg + 0.25, lean = 0.36;   // viewer's right = (fz, -fx)
      const a = [cx - rx * W / 2, y0, cz - rz * W / 2], b = [cx + rx * W / 2, y0, cz + rz * W / 2];
      const c = [b[0] - fx * lean, y0 + H, b[2] - fz * lean], d = [a[0] - fx * lean, y0 + H, a[2] - fz * lean];
      A.quad(r, a, b, c, d, 0, 1, 0, 1); B.quad(b, a, d, c, back);
      // the A-frame: two legs behind the panel to the ground, a foot bar
      for (const u of [-0.8, 0.8]) { const px = cx + rx * u, pz = cz + rz * u; B.beam(I4, [px - fx * lean, y0 + H - 0.05, pz - fz * lean], [px - fx * 0.9, yg - 0.05, pz - fz * 0.9], 0.05, leg); B.beam(I4, [px, y0, pz], [px, yg - 0.05, pz], 0.05, leg); }
      E.markRect(cx - fx * 0.4, cz - fz * 0.4, rx, rz, W / 2 + 0.6, 0.9, OCC.BUILT); n++;
    }
    out.vergeBoards = n;
  }
  if (Mz && Mz.Park) {
    const oPB = Mz.Park.build;
    Mz.Park.build = function (E, BK, out) { const r = oPB.apply(this, arguments); if (isMonza(E.t)) { try { vergeBoards(E, BK, out); } catch (e) { console.error('MonzaUp vergeBoards', e); } } return r; };
  }

  // ================================================================ surfaces (track.js): asphalt tone after the build
  if (EI.Track) {
    const oBS = EI.Track.prototype.buildSurfaces;
    EI.Track.prototype.buildSurfaces = function (g) {
      const r = oBS.apply(this, arguments);
      if (isMonza(this)) {
        try {
          const at = this.data.asphaltTint; const a = at && g.getObjectByName('asphalt');
          if (a && a.material && a.material.color) { a.material.color.setRGB(at[0], at[1], at[2]); if (this.data.asphaltEnv != null) a.material.envMapIntensity = this.data.asphaltEnv; }   // (the pale sky sheen at grazing angles: a weaker sky reflection)
        } catch (e) { console.error('MonzaUp surfaces', e); }
      }
      return r;
    };
  }
})();
