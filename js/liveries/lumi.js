// Equation I - Lumi Racing (own team) 2026 livery (owner: LIVERY-C). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  const Ads = () => EI.Ads;
  const LUMI_NUM = '800 % "Plus Jakarta Sans", "Titillium Web", Arial, sans-serif';
  const INTAKE_NUM = '800 % "Unbounded", "Titillium Web", Arial, sans-serif';
  // ---- Lumi Racing: cream car, plum sweep over the engine cover and rear, the mark's green and lilac quarter discs blown up on
  //      the sidepods, the lock-up big on the engine cover, the mark on the airbox and nose, trylumi.co on the wings
  const LUMI_SWEEP = [[2.3, 0.62], [1.4, 0.68], [0.55, 0.7], [-0.05, 0.6], [-0.55, 0.36], [-1.1, 0.16], [-1.6, 0.06]];
  function quarter(g, cx, cy, r, col) { g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - r, cy); g.arc(cx, cy, r, Math.PI, Math.PI * 1.5); g.closePath(); g.fill(); }
  function lumiSide(g, k, team, num, code, o) {
    const L = Ads().LUMI; const plum = L.plum;
    // plum sweep: everything above / behind the curve
    k.region(LUMI_SWEEP, [[-2.6, -0.1], [-2.6, TOP_V], [2.3, TOP_V]], plum);
    k.stroke(LUMI_SWEEP.map(([x, y]) => [x - 0.035, y - 0.035]), 0.022, L.lilac);
    k.stroke(LUMI_SWEEP.map(([x, y]) => [x - 0.075, y - 0.075]), 0.012, L.markGreen);
    // quarter discs from the mark, blown up on the cream sidepod (unmirrored, right angles bottom-right like the logo)
    // (the mark's own geometry at 0.34 m: lilac corner at the origin, green above it, the plum dot to the right)
    k.at(0.06, 0.16, () => { g.scale(0.78, 0.78); g.translate(60, 0); quarter(g, 0, 0, 177, L.markLilac); quarter(g, -7, -170, 170, L.markGreen); g.fillStyle = L.markPlum; g.beginPath(); g.arc(53, -143, 52, 0, Math.PI * 2); g.fill(); });
    // title: the lock-up, big on the plum engine cover / sidepod rear (reversed: cream wordmark, cream dot)
    k.at(-0.92, 0.5, () => Ads().lockupCentered(g, 'lumi', 0, 0, 175, 780, L.bg, true));
    // the mark on the airbox flank
    k.text('trylumi.co', -0.78, 0.885, 0.06, L.bg, '700 % "Plus Jakarta Sans", Arial, sans-serif', { ls: -0.02 });
    // URL + strapline on the cream sidepod front
    k.text('trylumi.co', 1.42, 0.43, 0.05, plum, '700 % "Plus Jakarta Sans", Arial, sans-serif', { ls: -0.02 });
    // number plate: cream disc-cornered plate with the number in the brand face
    k.at(-1.62, 0.56, () => { g.fillStyle = L.bg; Ads().rr(g, -120, -85, 240, 170, 46); g.fill(); g.font = '800 140px "Plus Jakarta Sans", Arial, sans-serif'; Ads().setLS(g, -6); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = plum; g.fillText(String(num), 0, 8); Ads().setLS(g, 0); quarter(g, 120, -85, 34, L.markGreen); });
    if (code) k.text(code, 1.42, 0.56, 0.08, plum, LUMI_NUM, { ls: -0.02 });
    // rear-wing endplates (plum) and front-wing endplates
    k.at(-2.13, 0.86, () => Ads().lumiMark(g, -60, -60, 120, null, true));
    k.text('trylumi.co', -2.13, 0.68, 0.05, L.bg, '700 % "Plus Jakarta Sans", Arial, sans-serif', { ls: -0.02 });
    k.text(String(num), -2.13, 0.54, 0.08, L.lilac, LUMI_NUM);
    k.text('trylumi.co', 2.68, 0.18, 0.035, plum, '700 % "Plus Jakarta Sans", Arial, sans-serif');
  }
  function lumiTop(g, t, team, num, o) {
    const L = Ads().LUMI;
    t.rect(-3, -0.05, -1.1, 1.1, L.plum);                                          // plum engine cover and rear
    t.rect(-0.05, 0.0, -1.1, 1.1, L.lilac); t.rect(0.0, 0.025, -1.1, 1.1, L.markGreen);
    t.at(1.38, 0, () => Ads().lumiMark(g, -100, -100, 200));                          // the mark big on the nose
    t.txt(String(num), 2.22, 0, 0.12, L.plum, LUMI_NUM, Math.PI);
    t.at(-2.1, 0, () => Ads().lockupCentered(g, 'lumi', 0, 0, 175, 860, L.bg, true)); // rear-wing top
  }
  LV.register('lumi', { own: true,
    side(L) { lumiSide(L.g, L.k, L.team, L.num, L.code); },
    top(L) { lumiTop(L.g, L.t, L.team, L.num); },
  });
})();
