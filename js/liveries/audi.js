// Equation I - Audi Revolut F1 Team, R26 (2026) livery (owner: LIVERY-B). Registered with the livery core js/liveries.js, which documents
// the helpers (L.partner / partnerAt / emblem / mark / number / codeText / wordmark, L.k side kit, L.t top kit).
// Coordinates: metres, x forward (nose tip 3.0, front axle 1.75, rear axle -1.85), y up, z right.
// Reference: the Berlin launch (F1.com gallery: front, 3/4, rear, close-ups of the nose and cockpit) and 2026 race photos (CHN, AUS,
// AUT, BEL, GBR, ITA): satin titanium nose, chassis and sidepod front; a Lava Red block on the rear half of the sidepod (vertical front
// edge, up to the sidepod shoulder, cooling louvres along its top); carbon-black engine cover and tail with the red-outlined Audi rings
// behind the airbox and the bp helios on the cover tail; black Revolut across the titanium sidepod, Castrol on the shoulder, ninjaOne
// white on the carbon under the inlet, NEXO by the cockpit; red Audi rings on the nose tip with the Revolut "R"; visit QATAR white on
// the carbon front-wing endplates; carbon rear wing with Revolut on the endplates and the red rings on the main plane; titanium halo
// with Gillette.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { TOP_V, LOW_V, W, MM } = LV.K;
  const TI = '#8f9399', TIL = '#b4b7bb', TID = '#6d7177', LR = '#f2361b', LRD = '#d8241a', BK = '#17181b';
  const A = () => EI.Ads;
  const has = (id) => !!(A() && A().hasPartner && A().hasPartner(id));
  function logo(g, id, w, h, tone, fb) {
    if (has(id) || !fb) return LV.partner(g, id, w, h, tone);
    g.save(); g.font = (fb.it ? 'italic ' : '') + (fb.w || 800) + ' 100px ' + fb.ff; const tw = g.measureText(fb.n).width / 100 * (1 + (fb.ls || 0) * 0.6);
    const cap = Math.min(h * 0.86, w / Math.max(0.05, tw)); LV.styledText(g, fb.n, cap, tone === 'white' ? '#ffffff' : tone === 'black' ? '#111214' : fb.col, { ff: fb.ff, w: fb.w, it: fb.it, ls: fb.ls }); g.restore();
  }
  function logoPart(g, id, w, h, tone, f) {
    if (!has(id)) return false; const a = A().partnerInfo(id).aspect; const pa = a * (f[2] - f[0]) / (f[3] - f[1]);
    const ph = Math.min(h, w / pa) * MM, pw = ph * pa, H = ph / (f[3] - f[1]), Wd = H * a;
    g.save(); g.beginPath(); g.rect(-pw / 2, -ph / 2, pw, ph); g.clip(); A().drawPartner(g, id, (0.5 - (f[0] + f[2]) / 2) * Wd, (0.5 - (f[1] + f[3]) / 2) * H, Wd, H, { tone }); g.restore(); return true;
  }
  const FB = {
    nexo: { n: 'NEXO', ff: '"Unbounded", "Titillium Web", Arial, sans-serif', w: 800, col: '#111214', ls: 0.12 },
    gillette: { n: 'Gillette', ff: '"Titillium Web", Arial, sans-serif', w: 900, it: 1, col: '#111214' },
    elevenlabs: { n: 'IIElevenLabs', ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 700, col: '#111214' },
    camozzi: { n: 'CAMOZZI', ff: 'Georgia, serif', w: 700, col: '#111214', ls: 0.08 },
    libertex: { n: 'Libertex', ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 700, col: '#111214' },
  };
  // "visit QATAR" (Visit Qatar's stacked wordmark), set in code
  function visitQatar(g, w, h, col) {
    if (has('visitqatar')) return LV.partner(g, 'visitqatar', w, h, col === '#ffffff' ? 'white' : 'black');
    const cap = Math.min(h * 0.42, w / 3.3); g.save(); g.translate(0, -cap * 0.55 * MM); LV.styledText(g, 'visit', cap * 0.95, col, { ff: 'Georgia, "Times New Roman", serif', w: 400 });
    g.translate(0, cap * 1.1 * MM); LV.styledText(g, 'QATAR', cap, col, { ff: 'Georgia, "Times New Roman", serif', w: 700, ls: 0.06 }); g.restore();
  }
  // the bp helios (green / yellow flower) + bp, as on the engine-cover tail
  function bp(g, w, h) { LV.partner(g, 'bp', w, h, 'color'); }
  LV.register('audi', {
    parts: { body: TI, fwFlap: TIL, fwEnd: BK, fwTip: TI, rwMain: BK, rwEnd: BK, rwFlap: BK, halo: TI, mirror: TI, fin: BK },
    num: { ff: '"Instrument Sans", "Titillium Web", Arial, sans-serif', w: 600, ls: 0.04 },
    halo: { inner: ['gillette', 'revolut'] },
    side(L) {
      const { k, g } = L;
      // satin titanium: lighter on top, darker low (brushed-metal flop)
      const gv = g.createLinearGradient(0, k.Y(0.95), 0, k.Y(0.15)); gv.addColorStop(0, TIL); gv.addColorStop(0.45, TI); gv.addColorStop(1, TID);
      k.poly([[3.2, TOP_V], [3.2, LOW_V], [-1.88, LOW_V], [-1.88, TOP_V]], gv);
      // carbon-black engine cover (behind the airbox, above the sidepod shoulder) and the whole tail
      k.region([[-0.2, 0.83], [-0.5, 0.84], [-1.12, 0.84]], [[-1.12, 0.12], [-2.6, 0.12], [-2.6, TOP_V], [-0.2, TOP_V]], BK);
      k.poly([[0.0, TOP_V], [0.0, 0.92], [-0.2, 0.83], [-0.2, TOP_V]], BK);
      k.region([[3.2, 0.13], [0.6, 0.14], [-1.2, 0.15]], [[-2.6, 0.15], [-2.6, LOW_V], [3.2, LOW_V]], BK);
      // the Lava Red block on the sidepod rear, louvres along its top
      const gr = g.createLinearGradient(0, k.Y(0.84), 0, k.Y(0.3)); gr.addColorStop(0, '#ff4a22'); gr.addColorStop(1, LRD);
      k.poly([[-0.38, 0.84], [-0.38, 0.27], [-0.75, 0.3], [-1.12, 0.38], [-1.12, 0.84]], gr);
      for (let i = 0; i < 7; i++) { const x = -0.48 - i * 0.08; k.poly([[x, 0.8], [x - 0.025, 0.8], [x - 0.025, 0.7 - (i % 2) * 0.02], [x, 0.7 - (i % 2) * 0.02]], 'rgba(20,10,10,0.55)'); }
      // logos
      L.partnerAt('revolut', -0.06, 0.45, 0.66, 0.16, 'black');
      L.partnerAt('castrol', -0.04, 0.545, 0.32, 0.062, 'black');
      k.region([[1.25, 0.42], [0.9, 0.42], [0.55, 0.38], [0.25, 0.3], [-0.05, 0.2]], [[-0.05, 0.1], [1.25, 0.1]], BK);   // carbon undercut / inlet vane
      L.partnerAt('ninjaone', 0.82, 0.33, 0.36, 0.07, 'white');
      k.at(1.02, 0.56, () => logo(g, 'nexo', 0.36, 0.07, 'black', FB.nexo));
      k.at(-0.6, 0.9, () => LV.partner(g, 'audi', 0.3, 0.09, 'mono:' + LR));        // the red-outlined rings on the black cover
      k.at(-1.36, 0.8, () => bp(g, 0.22, 0.07));
      k.at(0.0, 0.98, () => visitQatar(g, 0.16, 0.07, '#111214'));                     // on the titanium airbox
      k.at(2.05, 0.37, () => logo(g, 'elevenlabs', 0.28, 0.045, 'black', FB.elevenlabs));
      L.number(-1.62, 0.66, 0.08, '#ffffff'); L.codeText(1.42, 0.535, 0.04, '#111214');
      // front-wing endplate (carbon): visit QATAR white; rear-wing endplate (carbon): Revolut white
      k.poly([[-1.88, 1.1], [-1.88, 0.4], [-2.6, 0.4], [-2.6, 1.1]], BK);
      L.partnerAt('revolut', -2.14, 0.84, 0.36, 0.09, 'white');
      L.partnerAt('audi', -2.14, 0.68, 0.22, 0.06, 'mono:' + LR);
      // halo side: WORLD OF HYATT (inner), Gillette on top (see top)
      L.haloSide('WORLD OF HYATT', '#111214', { ff: 'Georgia, serif', w: 700, ls: 0.1 });
    },
    // front-wing endplates (own pass): carbon with visit QATAR white
    endplate(L) {
      const { k, g } = L;
      k.poly([[3.2, 0.0], [3.2, 0.6], [2.0, 0.6], [2.0, 0.0]], BK);
      k.at(2.52, 0.28, () => visitQatar(g, 0.32, 0.16, '#ffffff'));
    },
    top(L) {
      const { t, g } = L; const FRONT = Math.PI;   // the R26 nose column reads from the front
      // black engine cover / tail from above, the red block's top edge on the sidepods
      t.poly([[-0.2, -0.17], [-0.2, 0.17], [-1.2, 0.3], [-1.95, 0.3], [-1.95, -0.3], [-1.2, -0.3]], BK);
      for (const s of [-1, 1]) t.poly([[-0.4, s * 0.32], [-0.4, s * 0.6], [-1.15, s * 0.5], [-1.15, s * 0.3]], LR);
      // nose: red rings at the tip, the Revolut R, the race number in red, Pirelli / visit QATAR / Libertex
      t.at(2.76, 0, () => LV.partner(g, 'audi', 0.18, 0.055, 'mono:' + LR), FRONT);
      t.at(2.48, 0, () => { if (!logoPart(g, 'revolut', 0.1, 0.1, 'black', [0, 0, 0.145, 1])) LV.styledText(g, 'R', 0.06, '#111214', { w: 900 }); }, FRONT);
      L.number(2.12, 0, 0.11, LR);
      L.partnerTop('pirelli', 1.86, 0, 0.12, 0.025, 'color', FRONT);
      t.at(1.68, 0, () => visitQatar(g, 0.1, 0.05, '#111214'), FRONT);
      t.at(1.52, 0, () => logo(g, 'libertex', 0.13, 0.03, 'black', FB.libertex), FRONT);
      // sidepod shoulders: Castrol + CAMOZZI; front-wing flaps: Revolut black; rear wing: the big red rings
      for (const s of [-1, 1]) { L.partnerTop('castrol', 0.1, s * 0.42, 0.26, 0.05, 'black', 0); t.at(-0.15, s * 0.45, () => logo(g, 'camozzi', 0.2, 0.035, 'black', FB.camozzi)); }
      for (const s of [-1, 1]) L.partnerTop('revolut', 2.7, s * 0.62, 0.34, 0.075, 'black', 0);
      L.partnerTop('audi', -2.1, 0, 0.5, 0.13, 'mono:' + LR, 0);
      // halo: Gillette on both arms, the rings where they meet
      L.haloTop('Gillette', '#111214', -1, { it: 1, w: 900 }, 0.035); L.haloTop('Gillette', '#111214', 1, { it: 1, w: 900 }, 0.035);
      L.haloFront('audi', 'black');
    },
  });
  // front-wing main planes (LIVERY-LEAD default from the 2026 photos; a frontWing in the design above takes precedence)
  if (LV.designs['audi'] && !LV.designs['audi'].frontWing) LV.designs['audi'].frontWing = function (L) { L.t.rect(2.15, 3.25, -1.1, 1.1, '#151515'); for (const z of [-0.72, 0.72]) L.partnerTop('revolut', 2.6, z, 0.32, 0.09, 'white', Math.PI); };
})();
