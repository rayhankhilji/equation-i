// Equation I - Monza photo-match pass (MONZA-UPGRADE, WAVE 9; refs: staging/monza_refs/photos, 35 F1 photos 2023-25).
// Monza-gated hooks only (track id 'monza'); every other circuit runs the shared code untouched. Loaded after the other env files.
//   * surfaces: the 2024 resurfacing - near-black charcoal asphalt (data.asphaltTint, a material colour: no program / call change)
// All additions are uniform / vertex-colour changes or geometry merged into the scenery's existing statics (no new draw calls on Low).
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const isMonza = (t) => !!(t && t.data && t.data.id === 'monza');
  const MU = EI.MonzaUp = {};

  // ================================================================ surfaces (track.js): asphalt tone after the build
  if (EI.Track) {
    const oBS = EI.Track.prototype.buildSurfaces;
    EI.Track.prototype.buildSurfaces = function (g) {
      const r = oBS.apply(this, arguments);
      if (isMonza(this)) {
        try {
          const at = this.data.asphaltTint; const a = at && g.getObjectByName('asphalt');
          if (a && a.material && a.material.color) a.material.color.setRGB(at[0], at[1], at[2]);
        } catch (e) { console.error('MonzaUp surfaces', e); }
      }
      return r;
    };
  }
})();
