// Equation I - Lumi Racing (own team) 2026 livery (owner: LIVERY-C). Registered with the livery core js/liveries.js, which documents the helpers
// (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit) and the part colour keys.
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
//
// Lumi Racing (trylumi.co), dressed like a works team: the brand's own artwork only (assets/brand: the mark = green quarter disc over
// a lilac one with the plum dot; "lumi" set in Plus Jakarta Sans 700 like the site header) and its own palette (cream paper, plum,
// deep plum, the mark's green and lilac). Partners come from the two house brands only: Lumi is the title, Intake (intake.ink) the
// partner. Layout follows a real 2026 car:
//  - cream nose, cockpit and sidepod front; a plum sweep takes the engine cover, sidepod rear and tail, edged by lilac + green
//    keylines; deep-plum floor, undercut and lower chassis; the mark's quarter discs blown up on the sidepod as the team graphic
//  - title: the reversed lock-up big on the plum sidepod / cover; trylumi.co on the cover upper band; the strapline on the
//    cockpit side; intake as the partner on the floor fence and the front-wing endplates
//  - rear wing: deep-plum endplates with the mark + number, plum main plane with the lock-up on top; front wing plum flaps with
//    lilac tips; halo plum with trylumi.co on the top bar and the mark on the front; cream mirrors with the mark
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V } = LV.K;
  const Ads = () => EI.Ads;
  const NUM = '800 % "Plus Jakarta Sans", "Titillium Web", Arial, sans-serif';
  const TXT = '700 % "Plus Jakarta Sans", "Titillium Web", Arial, sans-serif';
  // plum sweep (everything above / behind it is plum) and the deep-plum lower line
  const SWEEP = [[2.3, 0.64], [1.45, 0.69], [0.62, 0.71], [0.05, 0.62], [-0.45, 0.42], [-0.95, 0.24], [-1.5, 0.12]];
  const LOWER = [[3.25, 0.2], [2.4, 0.26], [1.6, 0.3], [1.0, 0.31], [0.55, 0.26], [0.2, 0.2], [-0.6, 0.18], [-1.3, 0.16]];
  function quarter(g, cx, cy, r, col) { g.fillStyle = col; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - r, cy); g.arc(cx, cy, r, Math.PI, Math.PI * 1.5); g.closePath(); g.fill(); }
  LV.register('lumi', { own: true,
    parts: { body: '#fffaf2', fwFlap: '#5e3a5f', fwEnd: '#2d1a3b', fwTip: '#d1a7f2', rwMain: '#5e3a5f', rwEnd: '#2d1a3b', rwFlap: '#5e3a5f', halo: '#5e3a5f', mirror: '#fffaf2', fin: '#5e3a5f' },
    num: { ff: '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif', w: 800, ls: -0.04 },
    halo: { inner: ['trylumi.co', 'intake.ink'] },
    side(L) {
      const { g, k, num, code } = L; const C = Ads().LUMI;
      // plum sweep + keylines, deep-plum lower body
      k.region(SWEEP, [[-2.6, LOW_V], [-2.6, TOP_V], [2.3, TOP_V]], C.plum);
      k.stroke(SWEEP.map(([x, y]) => [x - 0.03, y - 0.03]), 0.02, C.lilac);
      k.stroke(SWEEP.map(([x, y]) => [x - 0.065, y - 0.065]), 0.011, C.markGreen);
      k.region(LOWER, [[-1.3, LOW_V], [3.25, LOW_V]], C.plumDeep);
      // the mark's quarter discs blown up on the cream sidepod front (right angles bottom-right, as in the logo)
      k.at(0.15, 0.25, () => { g.scale(0.56, 0.56); quarter(g, 0, 0, 300, C.markLilac); quarter(g, -12, -288, 288, C.markGreen); g.fillStyle = C.markPlum; g.beginPath(); g.arc(90, -242, 88, 0, Math.PI * 2); g.fill(); });
      // title lock-up, reversed, big on the plum sidepod / cover
      k.at(-0.85, 0.46, () => Ads().lockupCentered(g, 'lumi', 0, 0, 190, 860, C.bg, true));
      k.text('trylumi.co', -0.62, 0.86, 0.05, C.bg, TXT, { ls: -0.02 });
      k.text('Learn anything. Actually understand it.', -0.95, 0.31, 0.026, C.lilac, TXT, { ls: -0.01 });
      // cockpit side: the driver code + number in the brand face; strapline on the chassis
      if (code) k.text(code, 1.38, 0.58, 0.07, C.plum, NUM, { ls: -0.02 });
      k.text(String(num), 1.85, 0.47, 0.08, C.plum, NUM, { ls: -0.04 });
      k.text('Ask Lumi.', 1.05, 0.44, 0.032, C.plum, TXT);
      // partner (house brand): intake on the floor fence ahead of the sidepod, cream on deep plum
      k.at(0.82, 0.2, () => Ads().lockupCentered(g, 'intake', 0, 0, 40, 240, C.bg));
      // engine-cover rear: number plate
      k.at(-1.62, 0.62, () => { g.fillStyle = C.bg; Ads().rr(g, -105, -72, 210, 144, 40); g.fill(); g.font = NUM.replace('%', '120px'); Ads().setLS(g, -5); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = C.plum; g.fillText(String(num), 0, 7); Ads().setLS(g, 0); quarter(g, 105, -72, 30, C.markGreen); });
      // rear-wing endplates (deep plum): the reversed mark, trylumi.co, the number
      k.at(-2.13, 0.88, () => Ads().lumiMark(g, -55, -55, 110, null, true));
      k.text('trylumi.co', -2.13, 0.74, 0.04, C.bg, TXT, { ls: -0.02 });
      k.text(String(num), -2.13, 0.6, 0.085, C.lilac, NUM, { ls: -0.04 });
      // front-wing endplates (deep plum): intake partner + url
      k.at(2.68, 0.19, () => Ads().lockupCentered(g, 'intake', 0, 0, 44, 300, C.bg));
      k.text('trylumi.co', 2.68, 0.1, 0.028, C.lilac, TXT);
      L.haloSide('trylumi.co', C.bg, { ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 700, ls: -0.01 });
    },
    top(L) {
      const { g, t, num } = L; const C = Ads().LUMI;
      // plum engine cover + tail with the lilac / green keylines across the cover's leading edge
      t.rect(-3.2, -0.08, -1.2, 1.2, C.plum); t.rect(-0.08, -0.04, -1.2, 1.2, C.lilac); t.rect(-0.04, -0.015, -1.2, 1.2, C.markGreen);
      // nose: the mark big near the tip, the number reading from ahead, intake small
      t.at(2.62, 0, () => Ads().lumiMark(g, -55, -55, 110));
      t.txt(String(num), 2.22, 0, 0.12, C.plum, NUM, Math.PI);
      t.at(1.72, 0, () => Ads().lockupCentered(g, 'intake', 0, 0, 36, 200, C.plum), Math.PI);
      // engine cover spine: trylumi.co along the car; rear wing top: the reversed lock-up
      t.at(-0.95, 0, () => { g.font = TXT.replace('%', '70px'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = C.bg; g.fillText('trylumi.co', 0, 0); }, -Math.PI / 2);
      t.at(-2.1, 0, () => Ads().lockupCentered(g, 'lumi', 0, 0, 120, 820, C.bg, true));
      // sidepod tops: the mark
      for (const z of [-0.45, 0.45]) t.at(0.3, z, () => Ads().lumiMark(g, -60, -60, 120));
      // halo top bar + front, mirrors
      L.haloTop('trylumi.co', C.bg, -1); L.haloTop('Ask Lumi.', C.bg, 1);
      t.at(0.76, 0, () => Ads().lumiMark(g, -32, -32, 64, null, true));
      for (const z of [-0.52, 0.52]) t.at(0.8, z, () => Ads().lumiMark(g, -34, -34, 68));
    },
  });
})();
