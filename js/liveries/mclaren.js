// Equation I - mclaren 2026 livery (owner: LIVERY-A). Registered with the livery core js/liveries.js, which documents the helpers.
// Coordinates: metres, x forward (nose tip 3.05, front axle 1.75, rear axle -1.85), y up, z right (see liveries/mercedes.js for the
// model landmarks). McLaren Mastercard F1 Team MCL40 (2026 race photos, swarm/f1/liveryA/refs/mcl_*): papaya nose, chassis, cockpit
// sides and tail; an anthracite-black field over the engine-cover side and the sidepod split by a papaya band that sweeps from the
// cockpit down to the tail, a papaya flick at the sidepod's lower front; dark-teal Allwyn airbox; Gemini on the black cover, OKX and
// the Mastercard circles on the black sidepod, Cisco / ClubAvolta on papaya by the cockpit, Richard Mille and DP World on the chassis,
// Dell Technologies on the papaya tail, Dropbox on the papaya rear-wing endplates, ETIHAD on the black rear wing, workday on the
// front-wing endplates.
(function () {
  const LV = EI.LIVERIES; if (!LV) return;
  const { W, MM } = LV.K;
  const PAP = '#ff8000', AN = '#1d1e21', TEAL = '#0e4a40';
  LV.register('mclaren', {
    parts: { body: PAP, fwFlap: AN, fwEnd: PAP, fwTip: PAP, rwMain: AN, rwEnd: PAP, rwFlap: AN, halo: AN, mirror: '#14302b', fin: PAP },
    num: { ff: '"Plus Jakarta Sans", "Titillium Web", Arial, sans-serif', w: 800, ls: -0.02 },
    halo: { inner: ['@McLarenF1', 'mclaren.com'] },
    side(L) {
      const { k, g } = L;
      // anthracite lower chassis under the nose
      k.region([[3.15, 0.14], [2.4, 0.22], [1.6, 0.3], [1.1, 0.36], [0.8, 0.4]], [[0.8, -0.1], [3.2, -0.1]], AN);
      // the black field (engine-cover side + sidepod) between the cockpit / sidepod front and the papaya tail
      const FRONT = [[0.05, 1.2], [0.12, 0.86], [0.42, 0.66], [0.7, 0.48], [0.85, 0.3], [0.88, -0.1]];
      const TAIL = [[-1.02, -0.1], [-0.98, 0.36], [-0.82, 0.72], [-0.72, 1.2]];
      k.poly(FRONT.concat(TAIL), AN);
      // papaya band sweeping from the cockpit side down to the tail, papaya flick at the sidepod's lower front
      k.poly([[0.5, 0.76], [0.66, 0.6], [-0.2, 0.44], [-0.86, 0.3], [-0.92, 0.5], [-0.3, 0.6]], PAP);
      k.poly([[0.86, 0.14], [0.36, 0.14], [0.78, 0.36]], PAP);
      // Allwyn airbox: dark teal fading to black
      const gr = g.createLinearGradient(0, k.Y(1.1), 0, k.Y(0.82)); gr.addColorStop(0, TEAL); gr.addColorStop(1, AN);
      k.poly([[0.08, 1.2], [0.08, 0.86], [-0.4, 0.86], [-0.42, 1.2]], gr);
      L.wordmark('allwyn', -0.15, 0.99, 0.065, W, { ff: '"Plus Jakarta Sans", Arial, sans-serif', w: 800, ls: -0.02 });
      L.partnerAt('googlegemini', -0.52, 0.76, 0.52, 0.1, 'rev');
      L.partnerAt('okx', -0.22, 0.34, 0.4, 0.1, 'white');
      L.partnerAt('mastercard', -0.66, 0.24, 0.22, 0.12, 'color');
      L.partnerAt('cisco', 0.42, 0.68, 0.2, 0.085, 'mono:#9c3d00');
      L.wordmark('ClubAvolta', 0.3, 0.6, 0.04, W, { w: 700 });
      L.partnerAt('richardmille', 1.4, 0.58, 0.36, 0.04, 'mono:#7d1a12');
      L.partnerAt('dpworld', 1.0, 0.47, 0.22, 0.07, 'white', '#23286a');
      if (EI.Ads.hasPartner('delltechnologies')) L.partnerAt('delltechnologies', -1.2, 0.75, 0.36, 0.07, 'mono:#3a1f0c');
      else { L.wordmark('DELL', -1.2, 0.78, 0.05, '#3a1f0c', { w: 900, ls: 0.12 }); L.wordmark('Technologies', -1.2, 0.735, 0.024, '#3a1f0c', { w: 600 }); }
      L.partnerAt('mclarenspeedmark', 0.98, 0.25, 0.2, 0.06, 'color');
      // front-wing endplates: workday; rear-wing endplates: Dropbox
      L.partnerAt('workday', 2.5, 0.3, 0.3, 0.09, 'mono:#3a1f0c');
      L.partnerAt('dropbox', -2.17, 0.86, 0.4, 0.075, 'black'); L.partnerAt('groq', -2.17, 0.56, 0.14, 0.05, 'white');
      L.number(1.62, 0.52, 0.07, AN); L.codeText(1.85, 0.47, 0.045, AN);
      L.haloHandle('mclaren.com', W, -1); L.haloHandle('@McLarenF1', W, 1);
    },
    top(L) {
      const { t } = L;
      // black engine-cover top behind the airbox, papaya tail
      t.poly([[0.05, -0.26], [0.05, 0.26], [-0.75, 0.3], [-0.75, -0.3]], AN);
      t.poly([[0.05, -0.12], [0.05, 0.12], [-0.42, 0.12], [-0.42, -0.12]], TEAL);
      L.partnerTop('mclarenspeedmark', 2.6, 0, 0.16, 0.06, 'black', Math.PI);
      L.number(2.25, 0, 0.12, AN);
      L.partnerTop('mastercard', 1.85, 0, 0.12, 0.07, 'color', Math.PI);
      L.partnerTop('googlegemini', -0.45, 0, 0.36, 0.08, 'rev');
      L.partnerTop('etihadairways', -2.1, 0, 0.85, 0.12, 'white');
      for (const z of [-0.62, 0.62]) L.partnerTop('mastercard', 2.72, z, 0.14, 0.09, 'color');
      L.haloTop('@McLarenF1', W, -1); L.haloTop('mclaren.com', W, 1); L.haloFront('okx', 'white');
    },
  });
})();
