// Equation I - Monza photo-match pass (MONZA-UPGRADE, WAVE 9; refs: staging/monza_refs/photos, 35 F1 photos 2023-25).
// Monza-gated hooks only (track id 'monza'); every other circuit runs the shared code untouched. Loaded after the other env files.
//   * the park's trees: deep olive crowns, dark bark (data.treeTint on the tree materials)
//   * grandstands OSM misses: Lesmo 2 interno, the Parabolica outside through the exit (data.standsUp)
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
