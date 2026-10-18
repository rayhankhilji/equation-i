// Equation I - Yas Marina facade and material textures (street kit atlas regions), painted once per load:
// curtain-wall glass with mullions, floor slabs and lit rooms; floor-to-ceiling hospitality glass with lounges behind it; tensile
// fabric; grandstand back cladding and the lit concourse band under it; cream stone hotel and apartment facades with recessed,
// partly lit windows; glass office towers; LED partner boards. Window patterns are random per pane but fixed per load.
// Every lit pane is bright in the colour map: the builders give those surfaces a per-vertex emissive factor at night, so lit rooms
// glow while the dark glass between them stays dark (emission = colour x factor).
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const Tex = {};
  let R = null;
  const rgb = (c, k) => 'rgb(' + Math.round(U.clamp(c[0] * k, 0, 255)) + ',' + Math.round(U.clamp(c[1] * k, 0, 255)) + ',' + Math.round(U.clamp(c[2] * k, 0, 255)) + ')';
  // interior light colours: mostly warm hotel rooms, some neutral, a few cool offices
  const WARM = [[255, 198, 132], [255, 186, 118], [255, 210, 150], [250, 220, 175], [236, 230, 214], [214, 228, 255]];
  function room(x, r, X, Y, W, H, opts) {
    const c = WARM[Math.min(WARM.length - 1, Math.floor(Math.pow(r(), opts && opts.cool ? 0.6 : 1.6) * WARM.length))];
    const k = (0.62 + r() * 0.38) * (opts && opts.k || 1);
    // ceiling glow down to a dimmer floor, a light pool on the back wall
    const g = x.createLinearGradient(0, Y, 0, Y + H); g.addColorStop(0, rgb(c, k * 1.0)); g.addColorStop(0.35, rgb(c, k * 0.82)); g.addColorStop(1, rgb(c, k * 0.42));
    x.fillStyle = g; x.fillRect(X, Y, W, H);
    if (r() < 0.55) { const lx = X + W * (0.2 + r() * 0.6); const rg = x.createRadialGradient(lx, Y + H * 0.35, 1, lx, Y + H * 0.35, W * 0.6); rg.addColorStop(0, rgb(c, 1.15)); rg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rg; x.fillRect(X, Y, W, H); }
    // sheer curtains on some, furniture / a person silhouette on others
    if (r() < 0.3) { x.fillStyle = 'rgba(255,240,220,0.28)'; const cw = W * (0.25 + r() * 0.5); x.fillRect(r() < 0.5 ? X : X + W - cw, Y, cw, H); }
    if (r() < 0.35) { x.fillStyle = 'rgba(40,28,20,0.55)'; x.fillRect(X + W * r() * 0.6, Y + H * 0.68, W * (0.2 + r() * 0.3), H * 0.32); }
    if (opts && opts.people && r() < 0.6) { x.fillStyle = 'rgba(30,22,18,0.7)'; const px = X + W * (0.15 + r() * 0.7), ph = H * (0.42 + r() * 0.1); x.beginPath(); x.ellipse(px, Y + H - ph, W * 0.035, W * 0.035, 0, 0, 6.283); x.fill(); x.fillRect(px - W * 0.045, Y + H - ph + W * 0.03, W * 0.09, ph); }
  }
  function darkPane(x, r, X, Y, W, H, base) {
    const b = base || [24, 34, 46]; const g = x.createLinearGradient(X, Y, X + W * 0.6, Y + H); g.addColorStop(0, rgb(b, 1.25 + r() * 0.15)); g.addColorStop(1, rgb(b, 0.8)); x.fillStyle = g; x.fillRect(X, Y, W, H);
    // a faint reflection streak
    if (r() < 0.5) { x.save(); x.beginPath(); x.rect(X, Y, W, H); x.clip(); x.fillStyle = 'rgba(150,170,195,0.07)'; x.beginPath(); const s = X + r() * W; x.moveTo(s, Y); x.lineTo(s + W * 0.25, Y); x.lineTo(s - W * 0.1, Y + H); x.lineTo(s - W * 0.35, Y + H); x.fill(); x.restore(); }
  }

  Tex.regions = function () {
    if (R) return R; const SK = EI.StreetKit, AT = SK.Atlas;
    // atlas space is tight (shared 2048 street atlas): the day curtain wall and the night W rooms share one slot, and the
    // regions are ordered so the shelf packer fills its rows
    const night = !!(EI.Night && EI.Night.on);
    // ---- curtain wall (W hotel, glass towers): tile = 6 bays (1.6 m) x 4 floors (3.3 m) = 9.6 x 13.2 m
    const curtain = night ? null : AT.region('yasCurtain', 512, 512, (x, w, h) => {
      const r = U.rng(5150); const bw = w / 6, fh = h / 4; const slab = fh * 0.2;
      // one continuous tinted glass skin (no per-pane noise), a few rooms lit behind it, broad soft reflections across the whole wall
      const gg = x.createLinearGradient(0, 0, w, h); gg.addColorStop(0, '#22303d'); gg.addColorStop(0.5, '#1a2631'); gg.addColorStop(1, '#202d39'); x.fillStyle = gg; x.fillRect(0, 0, w, h);
      // rooms lit in short runs along a floor (a suite, a corridor end), not as a random checkerboard
      for (let f = 0; f < 4; f++) { let b = 0; while (b < 6) { if (r() < 0.16) { const run = 1 + Math.floor(r() * 3); for (let q = 0; q < run && b < 6; q++, b++) room(x, r, b * bw, f * fh + slab, bw, fh - slab, { k: 0.62 }); } else b++; } }
      x.save(); x.globalAlpha = 0.06; x.fillStyle = '#9fb8d0'; for (const [s0, s1] of [[0.1, 0.32], [0.55, 0.7], [0.82, 0.9]]) { x.beginPath(); x.moveTo(w * s0, 0); x.lineTo(w * s1, 0); x.lineTo(w * s1 - w * 0.35, h); x.lineTo(w * s0 - w * 0.35, h); x.fill(); } x.restore();
      // spandrels (dark grey glass with a light ledge line) and mullions
      for (let f = 0; f < 4; f++) { const Y = f * fh; const g = x.createLinearGradient(0, Y, 0, Y + slab); g.addColorStop(0, '#3a434b'); g.addColorStop(1, '#262d33'); x.fillStyle = g; x.fillRect(0, Y, w, slab); x.fillStyle = '#626c75'; x.fillRect(0, Y + slab - 3, w, 3); x.fillStyle = '#4a535b'; x.fillRect(0, Y, w, 2); }
      x.fillStyle = '#4c555d'; for (let b = 0; b <= 6; b++) x.fillRect(b * bw - 2, 0, 4, h); x.fillStyle = 'rgba(0,0,0,0.35)'; for (let b = 0; b <= 6; b++) x.fillRect(b * bw + 2, 0, 2, h);
    }, (x, w, h) => { const fh = h / 4; x.fillStyle = 'rgb(120,120,120)'; x.fillRect(0, 0, w, h); for (let f = 0; f < 4; f++) { x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, f * fh, w, fh * 0.2); } x.fillStyle = 'rgb(165,165,165)'; for (let b = 0; b <= 6; b++) x.fillRect(b * w / 6 - 2, 0, 4, h); },
    (x, w, h) => { const fh = h / 4; x.fillStyle = 'rgb(28,28,28)'; x.fillRect(0, 0, w, h); for (let f = 0; f < 4; f++) { x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, f * fh, w, fh * 0.2); } });
    // ---- the W hotel's rooms at night (u1 / u3): every floor a white slab edge with a glass balustrade over a balcony, rooms
    //      behind floor-to-ceiling glass, about half lit (warm), the rest dark blue-grey; tile = 6 bays (1.6 m) x 4 floors (3.3 m)
    const whotel = !night ? null : AT.region('yasWHotelN', 512, 512, (x, w, h) => {
      const r = U.rng(4141); const bw = w / 6, fh = h / 4; const slab = fh * 0.13, bal = fh * 0.3;
      x.fillStyle = '#1b2633'; x.fillRect(0, 0, w, h);
      for (let f = 0; f < 4; f++) {
        let b = 0; const Y = f * fh + slab, H = fh - slab;
        while (b < 6) { const run = 2 + Math.floor(r() * 4); const lit = r() < 0.3; for (let q = 0; q < run && b < 6; q++, b++) { if (lit) room(x, r, b * bw, Y, bw, H, { k: 0.6 }); else darkPane(x, r, b * bw, Y, bw, H, [30, 40, 58]); } }
        // glass balustrade: a pale translucent band over the lower third of the room, a white handrail on top
        x.fillStyle = 'rgba(205,215,235,0.32)'; x.fillRect(0, f * fh + fh - bal, w, bal); x.fillStyle = '#f2f1ee'; x.fillRect(0, f * fh + fh - bal - 3, w, 3);
        // the slab edge: a thick white band with a soft shadow under it
        x.fillStyle = '#d8d4e2'; x.fillRect(0, f * fh, w, slab); x.fillStyle = '#ffffff'; x.fillRect(0, f * fh, w, 3); x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, f * fh + slab, w, 3);
      }
      x.fillStyle = 'rgba(220,226,236,0.55)'; for (let b = 0; b <= 6; b++) x.fillRect(b * bw - 1, 0, 2, h);
    }, null, (x, w, h) => { const fh = h / 4; x.fillStyle = 'rgb(30,30,30)'; x.fillRect(0, 0, w, h); for (let f = 0; f < 4; f++) { x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, f * fh, w, fh * 0.13); } });
    // ---- the same wall for office towers: a cooler, busier grid (5 bays x 4 floors, 1.5 x 3.6 m)
    const office = AT.region('yasOffice', 384, 384, (x, w, h) => {
      const r = U.rng(733); const bw = w / 5, fh = h / 4; const slab = fh * 0.16;
      x.fillStyle = '#15202b'; x.fillRect(0, 0, w, h);
      for (let f = 0; f < 4; f++) { const lit = r() < 0.55; for (let b = 0; b < 5; b++) { const X = b * bw, Y = f * fh + slab; if (lit && r() < 0.8) room(x, r, X, Y, bw, fh - slab, { cool: true }); else darkPane(x, r, X, Y, bw, fh - slab, [20, 34, 52]); } }
      for (let f = 0; f < 4; f++) { x.fillStyle = '#2e3740'; x.fillRect(0, f * fh, w, slab); x.fillStyle = '#b4bec6'; x.fillRect(0, f * fh + slab - 2, w, 2); }
      x.fillStyle = '#aab4bd'; for (let b = 0; b <= 5; b++) x.fillRect(b * bw - 3, 0, 6, h);
    }, null, (x, w, h) => { x.fillStyle = 'rgb(30,30,30)'; x.fillRect(0, 0, w, h); });
    // ---- hospitality glass: floor-to-ceiling lounges, 3 floors of 4.8 m, 12 m wide (8 panes of 1.5 m)
    const hosp = AT.region('yasHosp', 512, 512, (x, w, h) => {
      const r = U.rng(2611); const pw = w / 8, fh = h / 3; const slab = fh * 0.13;
      for (let f = 0; f < 3; f++) {
        const Y = f * fh + slab, H = fh - slab; const lit = r() < 0.85;
        // one continuous lounge per floor: warm ceiling with linear light strips, a back wall, people and high tables
        const c = WARM[Math.floor(r() * 3)]; const g = x.createLinearGradient(0, Y, 0, Y + H); g.addColorStop(0, rgb(c, lit ? 1.0 : 0.25)); g.addColorStop(0.4, rgb(c, lit ? 0.72 : 0.18)); g.addColorStop(1, rgb(c, lit ? 0.45 : 0.12)); x.fillStyle = g; x.fillRect(0, Y, w, H);
        if (lit) {
          x.fillStyle = 'rgba(255,250,235,0.9)'; for (let k = 0; k < 4; k++) x.fillRect(0, Y + 4 + k * 2.5, w, 1.2);
          x.fillStyle = 'rgba(80,60,45,0.35)'; x.fillRect(0, Y + H * 0.55, w, H * 0.45);
          for (let p = 0; p < 16; p++) { const px = r() * w, ph = H * (0.38 + r() * 0.06), pc = r() < 0.5 ? 'rgba(25,20,18,0.8)' : 'rgba(' + (60 + r() * 120 | 0) + ',' + (30 + r() * 60 | 0) + ',' + (30 + r() * 80 | 0) + ',0.8)';
            const pw2 = 16 + r() * 5; x.fillStyle = pc; x.beginPath(); x.moveTo(px - pw2 / 2, Y + H); x.lineTo(px - pw2 * 0.42, Y + H - ph + 16); x.quadraticCurveTo(px, Y + H - ph + 8, px + pw2 * 0.42, Y + H - ph + 16); x.lineTo(px + pw2 / 2, Y + H); x.fill();
            x.beginPath(); x.ellipse(px, Y + H - ph + 4, 7, 8, 0, 0, 6.283); x.fill(); }
          x.fillStyle = 'rgba(240,235,225,0.8)'; for (let tb = 0; tb < 5; tb++) { const tx = r() * w; x.fillRect(tx, Y + H * 0.7, 26, 3); x.fillRect(tx + 11, Y + H * 0.7, 4, H * 0.3); }
        }
        // glass sheen
        const sg = x.createLinearGradient(0, Y, w, Y + H); sg.addColorStop(0, 'rgba(180,200,220,0.10)'); sg.addColorStop(0.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(180,200,220,0.06)'); x.fillStyle = sg; x.fillRect(0, Y, w, H);
        x.fillStyle = '#e9e8e4'; x.fillRect(0, f * fh, w, slab); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, f * fh + slab - 2, w, 2);
      }
      x.fillStyle = '#c9cfd4'; for (let p = 0; p <= 8; p++) x.fillRect(p * pw - 2, 0, 4, h);
    }, null, (x, w, h) => { const fh = h / 3; x.fillStyle = 'rgb(30,30,30)'; x.fillRect(0, 0, w, h); for (let f = 0; f < 3; f++) { x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, f * fh, w, fh * 0.13); } });
    // ---- the bridge pod's oval window (u1 / u3): a white skin round a dark lens with the lit lounge inside and our partners'
    //      sign across it (the texture spans the window quads; outside the oval it is the pod's white)
    const podWin = AT.region('yasPodWin', 512, 256, (x, w, h) => {
      x.fillStyle = '#f4f3f0'; x.fillRect(0, 0, w, h);
      const oval = () => { x.beginPath(); x.ellipse(w / 2, h / 2, w * 0.47, h * 0.4, 0, 0, 6.283); };
      oval(); x.fillStyle = '#0d0f16'; x.fill();
      x.save(); oval(); x.clip();
      const g = x.createLinearGradient(0, h * 0.1, 0, h * 0.9); g.addColorStop(0, '#3a1b5c'); g.addColorStop(0.55, '#7a3fb0'); g.addColorStop(1, '#2a1640'); x.fillStyle = g; x.globalAlpha = 0.75; x.fillRect(0, 0, w, h); x.globalAlpha = 1;
      const r = U.rng(9); for (let p = 0; p < 26; p++) { const px = w * (0.1 + r() * 0.8), ph = h * (0.18 + r() * 0.06); x.fillStyle = 'rgba(20,10,30,0.8)'; x.fillRect(px - 5, h * 0.88 - ph, 10, ph); x.beginPath(); x.arc(px, h * 0.88 - ph - 4, 5, 0, 6.283); x.fill(); }
      x.fillStyle = 'rgba(255,240,255,0.55)'; for (let k = 0; k < 9; k++) x.fillRect(w * 0.12 + k * w * 0.085, h * 0.17, w * 0.05, 3);
      // the sign band across the lens
      x.fillStyle = 'rgba(8,8,12,0.92)'; x.fillRect(0, h * 0.34, w, h * 0.26);
      x.fillStyle = '#ffffff'; x.font = '800 40px "Plus Jakarta Sans", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('trylumi.co', w * 0.5, h * 0.475);
      if (EI.Ads && EI.Ads.lumiMark) try { EI.Ads.lumiMark(x, w * 0.17, h * 0.37, h * 0.2); EI.Ads.lumiMark(x, w * 0.75, h * 0.37, h * 0.2); } catch (e) { }
      x.restore();
      oval(); x.strokeStyle = '#c9c6cf'; x.lineWidth = 6; x.stroke();
    }, null, (x, w, h) => { x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, 0, w, h); x.beginPath(); x.ellipse(w / 2, h / 2, w * 0.47, h * 0.4, 0, 0, 6.283); x.fillStyle = 'rgb(20,20,20)'; x.fill(); });
    // ---- tensile fabric (PTFE): bright white panels, seams every ~2.5 m, a faint weave
    const fabric = AT.region('yasFabric', 256, 256, (x, w, h) => {
      x.fillStyle = '#f7f6f2'; x.fillRect(0, 0, w, h); const r = U.rng(91);
      for (let k = 0; k < 900; k++) { x.fillStyle = 'rgba(0,0,0,' + (r() * 0.025).toFixed(3) + ')'; x.fillRect(r() * w, r() * h, 2, 2); }
      x.fillStyle = 'rgba(150,150,140,0.28)'; for (let k = 0; k < 4; k++) x.fillRect(k * 64, 0, 2, h);
      x.fillStyle = 'rgba(255,255,255,0.5)'; for (let k = 0; k < 4; k++) x.fillRect(k * 64 + 2, 0, 1, h);
    }, (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(110,110,110)'; for (let k = 0; k < 4; k++) x.fillRect(k * 64, 0, 3, h); });
    // ---- grandstand back cladding: pale composite panels 1.5 x 1 m, a louvre band, shadow gaps (12 x 6 m tile)
    const clad = AT.region('yasClad', 512, 256, (x, w, h) => {
      const r = U.rng(41); x.fillStyle = '#d9dde0'; x.fillRect(0, 0, w, h);
      const pw = w / 8, ph = h / 6;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) { x.fillStyle = 'rgba(' + (r() < 0.5 ? '255,255,255' : '0,0,0') + ',' + (0.02 + r() * 0.04).toFixed(3) + ')'; x.fillRect(i * pw, j * ph, pw, ph); }
      x.fillStyle = '#9da4aa'; for (let i = 0; i <= 8; i++) x.fillRect(i * pw - 1, 0, 2, h); for (let j = 0; j <= 6; j++) x.fillRect(0, j * ph - 1, w, 2);
      // louvre band two thirds up
      const ly = ph * 1.5; x.fillStyle = '#7b8389'; x.fillRect(0, ly, w, ph * 1.0); x.fillStyle = '#c4cacf'; for (let y = ly; y < ly + ph; y += 6) x.fillRect(0, y, w, 2);
    }, (x, w, h) => { x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(100,100,100)'; for (let i = 0; i <= 8; i++) x.fillRect(i * w / 8 - 1, 0, 2, h); for (let j = 0; j <= 6; j++) x.fillRect(0, j * h / 6 - 1, w, 2); });
    // ---- the concourse band under a grandstand: open bays with lit kiosks, people, signage (12 x 4 m)
    const concourse = AT.region('yasConcourse', 512, 160, (x, w, h) => {
      const r = U.rng(66); x.fillStyle = '#2a2622'; x.fillRect(0, 0, w, h);
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgb(255,226,170)'); g.addColorStop(0.3, 'rgb(200,160,110)'); g.addColorStop(1, 'rgb(110,88,62)'); x.fillStyle = g; x.fillRect(0, 14, w, h - 14);
      for (let k = 0; k < 4; k++) { const X = k * 128 + 16; x.fillStyle = ['#e7522f', '#1e88e5', '#2fb36d', '#f2b705'][k]; x.fillRect(X, 26, 96, 14); x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(X + 8, 31, 50, 4); x.fillStyle = 'rgba(255,245,220,0.9)'; x.fillRect(X, 44, 96, 40); x.fillStyle = 'rgba(60,40,30,0.5)'; x.fillRect(X + 6, 84, 84, 24); }
      for (let p = 0; p < 30; p++) { const px = r() * w, ph = 46 + r() * 10; x.fillStyle = 'rgba(' + (20 + r() * 80 | 0) + ',' + (15 + r() * 50 | 0) + ',' + (15 + r() * 60 | 0) + ',0.9)'; x.fillRect(px - 4, h - ph + 8, 8, ph - 8); x.beginPath(); x.arc(px, h - ph + 4, 4.5, 0, 6.283); x.fill(); }
      x.fillStyle = '#4a4f55'; for (let k = 0; k <= 8; k++) x.fillRect(k * 64 - 3, 0, 6, h); x.fillStyle = '#d0d4d8'; x.fillRect(0, 0, w, 14);
    }, null, null, 'u');
    // ---- cream stone hotel facade: 5 windows x 4 floors (3.2 x 3.3 m), deep reveals, a balcony slab under every other floor
    const stoneH = AT.region('yasStoneHotel', 384, 384, (x, w, h) => {
      const r = U.rng(808); x.fillStyle = '#e4d7bf'; x.fillRect(0, 0, w, h); const bw = w / 5, fh = h / 4;
      for (let k = 0; k < 1500; k++) { x.fillStyle = 'rgba(120,100,70,' + (r() * 0.05).toFixed(3) + ')'; x.fillRect(r() * w, r() * h, 3, 2); }
      for (let f = 0; f < 4; f++) for (let b = 0; b < 5; b++) {
        const X = b * bw + bw * 0.16, Y = f * fh + fh * 0.18, W = bw * 0.68, H = fh * 0.66;
        x.fillStyle = '#9c8a6c'; x.fillRect(X - 5, Y - 5, W + 10, H + 10);
        if (r() < 0.5) room(x, r, X, Y, W, H); else darkPane(x, r, X, Y, W, H, [30, 34, 40]);
        x.fillStyle = 'rgba(210,200,180,0.9)'; x.fillRect(X + W / 2 - 2, Y, 4, H);
      }
      for (let f = 0; f < 4; f++) { x.fillStyle = '#f0e8d8'; x.fillRect(0, f * fh, w, 7); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, f * fh + 7, w, 3); }
    }, (x, w, h) => { const bw = w / 5, fh = h / 4; x.fillStyle = 'rgb(140,140,140)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(90,90,90)'; for (let f = 0; f < 4; f++) for (let b = 0; b < 5; b++) x.fillRect(b * bw + bw * 0.16, f * fh + fh * 0.18, bw * 0.68, fh * 0.66); },
    (x, w, h) => { const bw = w / 5, fh = h / 4; x.fillStyle = 'rgb(200,200,200)'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgb(30,30,30)'; for (let f = 0; f < 4; f++) for (let b = 0; b < 5; b++) x.fillRect(b * bw + bw * 0.16, f * fh + fh * 0.18, bw * 0.68, fh * 0.66); });
    // ---- low-rise white Gulf buildings (villas, offices, service blocks): white render, horizontal window strips, sun screens
    const white = AT.region('yasWhiteBlock', 512, 256, (x, w, h) => {
      const r = U.rng(312); x.fillStyle = '#ecebe6'; x.fillRect(0, 0, w, h); const fh = h / 2;
      for (let f = 0; f < 2; f++) { const Y = f * fh + fh * 0.3, H = fh * 0.42; for (let k = 0; k < 6; k++) { const X = k * w / 6 + 6, W = w / 6 - 12; if (r() < 0.38) room(x, r, X, Y, W, H); else darkPane(x, r, X, Y, W, H, [36, 44, 52]); }
        x.fillStyle = 'rgba(140,140,135,0.8)'; for (let k = 0; k < w; k += 9) x.fillRect(k, Y - 6, 3, H + 6); x.fillStyle = '#d6d4cd'; x.fillRect(0, Y + H, w, 6); }
    }, null, (x, w, h) => { const fh = h / 2; x.fillStyle = 'rgb(180,180,180)'; x.fillRect(0, 0, w, h); for (let f = 0; f < 2; f++) { x.fillStyle = 'rgb(40,40,40)'; x.fillRect(0, f * fh + fh * 0.3, w, fh * 0.42); } });
    // ---- LED partner boards (emissive at night): eight tiles of the partners' artwork side by side
    const led = AT.region('yasLED', 1024, 64, (x, w, h) => { for (let k = 0; k < 8; k++) { if (EI.Ads && EI.Ads.paintTile) EI.Ads.paintTile(x, k + 3, k * 128, 0, 128, 64, 2); } x.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1); }, null, null, 'u');
    R = { curtain, office, hosp, fabric, clad, concourse, stoneH, white, led, whotel, podWin }; return R;
  };
  Tex.reset = function () { R = null; };
  EI.EnvYasTex = Tex;
})();
