// Equation I - Intake Racing (own team) 2026 livery (owner: LIVERY-C). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
//
// Intake Racing (intake.ink), dressed like a works team: the brand's own artwork only (assets/brand/intake-icon: the sky-blue rounded
// square with the cocoa "i"; "intake" set in Unbounded 700 like the site header, Instrument Sans for the small type) and its palette
// (sky blue, cocoa ink, cream paper, the site's yellow / green / pink accents). Partners come from the two house brands only: Intake
// is the title, Lumi (trylumi.co) the partner. Layout follows a real 2026 car:
//  - sky-blue nose, cockpit and sidepods; a cocoa "notebook cover" engine cover and tail on dotted paper, edged in cream with a yellow
//    keyline; cocoa floor, undercut and lower chassis
//  - title: the lock-up big on the sidepod, the blue "i" big on the cocoa cover; intake.ink on the cover upper band; the strapline
//    under the title; lumi as the partner on the floor fence and the front-wing endplates
//  - rear wing: cocoa endplates with the icon + number, cocoa main plane with the cream lock-up on top; front wing cocoa flaps with
//    sky tips; halo cocoa with intake.ink on the top bar and the icon on the front; sky mirrors with the icon
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V } = LV.K;
  const Ads = () => EI.Ads;
  const NUM = '800 % "Unbounded", "Titillium Web", Arial, sans-serif';
  const TXT = '600 % "Instrument Sans", "Titillium Web", Arial, sans-serif';
  // cocoa cover edge (everything behind it is cocoa) and the cocoa lower line
  const EDGE = [[0.3, TOP_V], [0.14, 0.98], [-0.12, 0.74], [-0.45, 0.42], [-0.68, 0.16], [-0.74, LOW_V]];
  const LOWER = [[3.25, 0.19], [2.4, 0.24], [1.6, 0.28], [1.0, 0.29], [0.55, 0.24], [0.2, 0.19], [-0.8, 0.17]];
  function dots(g, k, poly, col) {   // the site's dotted paper inside a side-view polygon
    g.save(); k.path(poly); g.clip(); g.fillStyle = col;
    for (let x = -2600; x <= 400; x += 34) for (let y = -1400; y <= 100; y += 34) { g.beginPath(); g.arc(x, y, 4.2, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  LV.register('intake', { own: true,
    parts: { body: '#5bbcff', fwFlap: '#2b211c', fwEnd: '#2b211c', fwTip: '#5bbcff', rwMain: '#2b211c', rwEnd: '#2b211c', rwFlap: '#2b211c', halo: '#2b211c', mirror: '#5bbcff', fin: '#2b211c' },
    num: { ff: '"Unbounded", "Titillium Web", Arial, sans-serif', w: 800, ls: -0.04 },
    halo: { inner: ['intake.ink', 'trylumi.co'] },
    side(L) {
      const { g, k, num, code } = L; const I = Ads().INTAKE;
      const COVER = EDGE.concat([[-2.6, LOW_V], [-2.6, TOP_V]]);
      k.path(COVER); g.fillStyle = I.ink; g.fill(); dots(g, k, COVER, 'rgba(255,248,236,0.15)');
      k.stroke(EDGE.slice(1, 5).map(([x, y]) => [x + 0.035, y]), 0.022, I.bg);
      k.stroke(EDGE.slice(1, 5).map(([x, y]) => [x + 0.07, y]), 0.01, I.yellow);
      k.region(LOWER, [[-0.8, LOW_V], [3.25, LOW_V]], I.ink);
      // title: the lock-up on the sidepod, the strapline under it; the blue "i" big on the cocoa cover
      k.at(0.12, 0.43, () => Ads().lockupCentered(g, 'intake', 0, 0, 120, 640, I.ink, true));   // reversed icon (cocoa square) on the sky-blue pod
      k.text('Win your degree apprenticeship.', 0.12, 0.33, 0.03, I.ink, TXT);
      k.at(-1.1, 0.5, () => Ads().intakeMark(g, -165, -165, 330));
      k.text('intake.ink', -0.68, 0.88, 0.055, I.bg, TXT);
      // cockpit side: driver code + number in the brand face
      if (code) k.text(code, 1.38, 0.58, 0.06, I.ink, NUM, { ls: -0.03 });
      k.text(String(num), 1.85, 0.46, 0.07, I.ink, NUM, { ls: -0.04 });
      // partner (house brand): lumi on the floor fence ahead of the sidepod (cream on cocoa: reversed mark)
      k.at(0.82, 0.2, () => Ads().lockupCentered(g, 'lumi', 0, 0, 44, 240, I.bg, true));
      // engine-cover rear: number plate
      k.at(-1.62, 0.66, () => { g.fillStyle = I.bg; Ads().rr(g, -110, -70, 220, 140, 34); g.fill(); g.font = NUM.replace('%', '100px'); Ads().setLS(g, -4); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = I.ink; g.fillText(String(num), 0, 7); Ads().setLS(g, 0); });
      // rear-wing endplates (cocoa): icon, url, number
      k.at(-2.13, 0.88, () => Ads().intakeMark(g, -55, -55, 110));
      k.text('intake.ink', -2.13, 0.74, 0.042, I.bg, TXT);
      k.text(String(num), -2.13, 0.6, 0.075, I.blue, NUM, { ls: -0.04 });
      // front-wing endplates (cocoa): lumi partner + url
      k.at(2.68, 0.19, () => Ads().lockupCentered(g, 'lumi', 0, 0, 46, 300, I.bg, true));
      k.text('intake.ink', 2.68, 0.1, 0.028, I.blue, TXT);
      L.haloSide('intake.ink', I.bg, { ff: '"Instrument Sans", Arial, sans-serif', w: 600 });
    },
    top(L) {
      const { g, t, num } = L; const I = Ads().INTAKE;
      // cocoa cover + tail on dotted paper, cream + yellow keylines across its leading edge
      t.rect(-3.2, -0.22, -1.2, 1.2, I.ink);
      g.save(); g.beginPath(); g.rect(-1200, 220, 2400, 3000); g.clip(); g.fillStyle = 'rgba(255,248,236,0.15)';
      for (let z = -1200; z <= 1200; z += 34) for (let x = 220; x <= 3200; x += 34) { g.beginPath(); g.arc(z, x, 4.2, 0, Math.PI * 2); g.fill(); }
      g.restore();
      t.rect(-0.22, -0.19, -1.2, 1.2, I.bg); t.rect(-0.19, -0.175, -1.2, 1.2, I.yellow);
      // nose: the reversed icon near the tip, the number reading from ahead, lumi small
      t.at(2.6, 0, () => Ads().intakeMark(g, -55, -55, 110, null, true));
      t.txt(String(num), 2.2, 0, 0.1, I.ink, NUM, Math.PI);
      t.at(1.72, 0, () => Ads().lockupCentered(g, 'lumi', 0, 0, 38, 200, I.ink), Math.PI);
      // engine cover spine: intake.ink along the car; rear wing top: the cream lock-up
      t.at(-0.95, 0, () => { g.font = TXT.replace('%', '66px'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = I.bg; g.fillText('intake.ink', 0, 0); }, -Math.PI / 2);
      t.at(-2.1, 0, () => Ads().lockupCentered(g, 'intake', 0, 0, 110, 820, I.bg));
      // sidepod tops: the icon
      for (const z of [-0.45, 0.45]) t.at(0.3, z, () => Ads().intakeMark(g, -55, -55, 110, null, true));
      // halo top bar + front, mirrors
      L.haloTop('intake.ink', I.bg, -1); L.haloTop('Win your degree apprenticeship.', I.bg, 1, null, 0.028);
      t.at(0.76, 0, () => Ads().intakeMark(g, -30, -30, 60));
      for (const z of [-0.52, 0.52]) t.at(0.8, z, () => Ads().intakeMark(g, -32, -32, 64, null, true));
    },
  });
})();
