// Equation I - Intake Racing (own team) 2026 livery (owner: LIVERY-C). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  const Ads = () => EI.Ads;
  const LUMI_NUM = '800 % "Plus Jakarta Sans", "Titillium Web", Arial, sans-serif';
  const INTAKE_NUM = '800 % "Unbounded", "Titillium Web", Arial, sans-serif';
  // ---- Intake Racing: sky-blue car with a cocoa "notebook cover" engine cover on dotted paper, the blue "i" big on it, the
  //      lock-up on the sidepods, and the employers whose programmes are open as partner patches
  const INTAKE_EDGE = [[0.25, TOP_V], [0.1, 0.95], [-0.15, 0.7], [-0.5, 0.36], [-0.7, 0.1], [-0.75, LOW_V]];
  function intakeSide(g, k, team, num, code, o) {
    const I = Ads().INTAKE;
    k.path(INTAKE_EDGE.concat([[-2.6, LOW_V], [-2.6, TOP_V]])); g.fillStyle = I.ink; g.fill();
    g.save(); k.path(INTAKE_EDGE.concat([[-2.6, LOW_V], [-2.6, TOP_V]])); g.clip(); g.fillStyle = 'rgba(255,248,236,0.16)';
    for (let x = -2600; x <= 400; x += 34) for (let y = -1400; y <= 100; y += 34) { g.beginPath(); g.arc(x, y, 4.2, 0, Math.PI * 2); g.fill(); }
    g.restore();
    k.stroke(INTAKE_EDGE.slice(1, 5).map(([x, y]) => [x + 0.04, y]), 0.02, I.bg);
    // the blue "i" big on the cover, the lock-up on the sidepod
    k.at(-1.12, 0.47, () => Ads().intakeMark(g, -170, -170, 340));
    k.at(0.0, 0.4, () => Ads().lockupCentered(g, 'intake', 0, 0, 125, 600, I.ink));
    k.text('Win your degree apprenticeship.', 0.0, 0.295, 0.032, I.ink, '600 % "Instrument Sans", Arial, sans-serif');
    k.text('intake.ink', -0.62, 0.885, 0.06, I.bg, '600 % "Instrument Sans", Arial, sans-serif');
    // employer partner patches (cream plates): sidepod lower row, chassis, engine-cover rear
    const pat = (id, x, y, cap, maxW) => k.decal({ emp: id, bg: I.bg }, x, y, cap, maxW);
    pat('goldman-sachs', 0.3, 0.205, 0.042, 0.25); pat('kpmg', 0.02, 0.205, 0.042, 0.25); pat('rolls-royce', -0.24, 0.205, 0.042, 0.2);
    pat('bank-of-england', 1.74, 0.47, 0.04, 0.16); pat('jp-morgan', 1.4, 0.43, 0.034, 0.28);
    pat('bae-systems', -1.12, 0.22, 0.028, 0.32);
    // number plate: cream plate, cocoa number in the brand face
    k.at(-1.62, 0.6, () => { g.fillStyle = I.bg; Ads().rr(g, -125, -80, 250, 160, 40); g.fill(); g.font = '800 118px "Unbounded", Arial, sans-serif'; Ads().setLS(g, -5); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = I.ink; g.fillText(String(num), 0, 8); Ads().setLS(g, 0); });
    if (code) k.text(code, 1.42, 0.56, 0.065, I.ink, INTAKE_NUM, { ls: -0.03 });
    // rear-wing endplates (cocoa) and front-wing endplates
    k.at(-2.13, 0.86, () => Ads().intakeMark(g, -60, -60, 120));
    k.text('intake.ink', -2.13, 0.68, 0.05, I.bg, '600 % "Instrument Sans", Arial, sans-serif');
    k.text(String(num), -2.13, 0.54, 0.075, I.blue, INTAKE_NUM);
    k.text('intake.ink', 2.68, 0.18, 0.035, I.ink, '600 % "Instrument Sans", Arial, sans-serif');
  }
  function intakeTop(g, t, team, num, o) {
    const I = Ads().INTAKE;
    t.rect(-3, -0.2, -1.1, 1.1, I.ink);
    g.save(); g.beginPath(); g.rect(-1100, 200, 2200, 3000); g.clip(); g.fillStyle = 'rgba(255,248,236,0.16)';
    for (let z = -1100; z <= 1100; z += 34) for (let x = 200; x <= 3200; x += 34) { g.beginPath(); g.arc(z, x, 4.2, 0, Math.PI * 2); g.fill(); }
    g.restore();
    t.rect(-0.2, -0.17, -1.1, 1.1, I.bg);
    t.at(1.38, 0, () => Ads().intakeMark(g, -100, -100, 200, null, true));           // reversed icon big on the blue nose
    t.txt(String(num), 2.22, 0, 0.11, I.ink, INTAKE_NUM, Math.PI);
    t.at(-2.1, 0, () => Ads().lockupCentered(g, 'intake', 0, 0, 150, 860, I.bg));     // rear-wing top (cocoa)
  }
  LV.register('intake', { own: true,
    side(L) { intakeSide(L.g, L.k, L.team, L.num, L.code); },
    top(L) { intakeTop(L.g, L.t, L.team, L.num); },
  });
})();
