// Equation I - the 2026 team liveries (one design function per team, drawn procedurally).
// carglb.js composes every car's livery texture by projecting orthographic SIDE and TOP views of the car (metres; x forward,
// y up, z right; nose tip x 3.0, front axle 1.75, rear axle -1.85) onto the bodywork (see CarGLB.projectDecals). Each team
// here gives:
//   parts : the base colour of each painted part of the model (body, wings, endplates, halo, mirrors, fins), names in PART_KEYS
//   side(L): colour blocks / stripes / emblems / partner logos for one side (called for both, mirrored so text reads left->right)
//   top(L) : the same for the up-facing surfaces (nose, sidepod tops, engine cover, rear wing top), text reads from behind
//   num   : the race-number style (font, colour, slant, condensing)
// Partner logos are drawn through EI.Ads.drawPartner (f1-BRAND: real artwork, aspect kept); without it a styled wordmark is
// drawn instead. Everything is painted once per team + number + driver code and cached by carglb.js (no per-frame work).
window.EI = window.EI || {};
(function () {
  const MM = 1000;
  const TOP_V = 1.4, LOW_V = -0.1;
  // ---------------------------------------------------------------- shared drawing helpers (side kit k comes from carglb)
  const slug = (n) => String(n).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
  const lum = (h) => { const c = parseInt(String(h).slice(1), 16); return (0.2126 * (c >> 16) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255; };
  // number / wordmark text in metres at (0, 0) of the current transform: st = { ff, w, it, sx, skew, ls, outline: [w m, col] }
  function styledText(g, str, cap, col, st) {
    st = st || {}; g.save(); if (st.sx) g.scale(st.sx, 1); if (st.skew) g.transform(1, 0, -st.skew, 1, 0, 0);
    g.font = (st.it ? 'italic ' : '') + (st.w || 900) + ' ' + (cap * MM).toFixed(1) + 'px ' + (st.ff || '"Titillium Web", Arial, sans-serif');
    if (EI.Ads && EI.Ads.setLS) EI.Ads.setLS(g, (st.ls || 0) * cap * MM);
    g.textAlign = st.align || 'center'; g.textBaseline = 'middle';
    if (st.outline) { g.lineWidth = st.outline[0] * MM; g.strokeStyle = st.outline[1]; g.lineJoin = 'round'; g.strokeText(str, 0, cap * MM * 0.04); }
    g.fillStyle = col; g.fillText(str, 0, cap * MM * 0.04);
    if (EI.Ads && EI.Ads.setLS) EI.Ads.setLS(g, 0); g.restore();
  }
  // text along a polyline pts (canvas units, mm), centred on the path length; letters upright on the path's left-hand normal
  function textOnPath(g, str, pts, cap, col, st) {
    st = st || {}; g.save(); g.font = (st.it ? 'italic ' : '') + (st.w || 700) + ' ' + (cap * MM).toFixed(1) + 'px ' + (st.ff || '"Titillium Web", Arial, sans-serif');
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
    const seg = []; let L = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; }
    const sp = (st.ls || 0.02) * cap * MM; const ws = Array.from(str).map(ch => g.measureText(ch).width + sp); let tw = ws.reduce((a, b) => a + b, 0) - sp;
    const sc = tw > L * 0.96 ? L * 0.96 / tw : 1; let d = (L - tw * sc) / 2;
    const at = (dd) => { let i = 0; while (i < seg.length - 1 && dd > seg[i]) { dd -= seg[i]; i++; } const a = pts[i], b = pts[i + 1], f = Math.min(1, dd / seg[i]); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])]; };
    Array.from(str).forEach((ch, i) => { const w = ws[i] * sc; const p = at(d + (w - sp * sc) / 2); g.save(); g.translate(p[0], p[1]); g.rotate(p[2]); g.scale(sc, sc); g.fillText(ch, 0, cap * MM * 0.04); g.restore(); d += w; });
    g.restore();
  }
  // partner logo centred on the current origin inside w x h (metres). tone: 'white' | 'black' | 'color' | 'mono:#hex'
  const FALLBACK = {   // styled-text stand-ins (used only when f1-BRAND has no artwork for the id)
    petronas: { n: 'PETRONAS', w: 900, col: '#00a19c' }, hp: { n: 'hp', w: 700, it: 1, col: '#0096d6' }, mastercard: { mc: 1 },
    oracle: { n: 'ORACLE', w: 700, col: '#c74634' }, visa: { n: 'VISA', w: 900, it: 1, col: '#1a1f71' }, cashapp: { n: 'Cash App', w: 800, col: '#00d64f' },
    bwt: { n: 'bwt', w: 900, col: '#ff5aa5' }, tgr: { n: 'GR', w: 900, it: 1, col: '#eb0a1e' }, revolut: { n: 'Revolut', w: 700, col: '#ffffff' },
    atlassian: { n: 'ATLASSIAN', w: 700, col: '#0052cc' }, aramco: { n: 'aramco', w: 700, col: '#00a3e0' }, microsoft: { n: 'Microsoft', w: 600, col: '#ffffff' },
    ford: { oval: 1 }, redbull: { bull: 1 }, shell: { n: 'Shell', w: 800, col: '#ffd500' }, okx: { n: 'OKX', w: 900, col: '#000000' },
    allwyn: { n: 'ALLWYN', w: 800, col: '#ffffff' }, honda: { n: 'HONDA', w: 900, col: '#ffffff' }, haasautomation: { n: 'HAAS', w: 900, col: '#e6002b' },
    barclays: { n: 'BARCLAYS', w: 700, col: '#00aeef' }, msccruises: { n: 'MSC', w: 900, col: '#ffffff' }, cadillac: { n: 'CADILLAC', w: 600, col: '#ffffff', ls: 0.3 },
    audi: { rings: 1 }, mercedesbenz: { star: 1 }, haas: { n: 'HAAS', w: 900, it: 1, col: '#e6002b' }, tgremblem: { n: 'GR', w: 900, it: 1, col: '#eb0a1e' }, tommyhilfiger: { n: 'TOMMY HILFIGER', w: 700, col: '#ffffff' },
  };
  function toneCol(tone, def) { if (!tone || tone === 'color') return def; if (tone === 'white') return '#ffffff'; if (tone === 'black') return '#111214'; if (tone.indexOf('mono:') === 0) return tone.slice(5); return def; }
  function partner(g, id, w, h, tone, plate) {
    const A = EI.Ads; const sid = slug(id); const f0 = FALLBACK[sid];
    // f1-BRAND's artwork (aspect kept); it draws a wordmark itself for unknown ids, except where a drawn emblem below reads better
    if (A && A.drawPartner && (!(f0 && !f0.n) || (A.hasPartner && A.hasPartner(id)))) { A.drawPartner(g, id, 0, 0, w * MM, h * MM, { tone: tone || 'color', plate: plate || null }); return; }
    id = sid; const f = f0 || { n: id.toUpperCase(), w: 800, col: '#ffffff' };
    if (plate) { g.fillStyle = plate; const pw = w * MM, ph = h * MM; if (EI.Ads && EI.Ads.rr) EI.Ads.rr(g, -pw / 2, -ph / 2, pw, ph, ph * 0.2); else { g.beginPath(); g.rect(-pw / 2, -ph / 2, pw, ph); } g.fill(); w *= 0.84; h *= 0.72; }
    if (f.mc) { const r = Math.min(h * 0.5, w * 0.31) * MM; g.globalAlpha = 1; g.fillStyle = tone === 'white' || tone === 'black' ? toneCol(tone) : '#eb001b'; g.beginPath(); g.arc(-r * 0.62, 0, r, 0, 7); g.fill(); g.fillStyle = tone === 'white' || tone === 'black' ? toneCol(tone) : '#f79e1b'; g.beginPath(); g.arc(r * 0.62, 0, r, 0, 7); g.fill(); if (!tone || tone === 'color') { g.fillStyle = '#ff5f00'; g.beginPath(); g.arc(-r * 0.62, 0, r, -1.02, 1.02); g.arc(r * 0.62, 0, r, Math.PI - 1.02, Math.PI + 1.02); g.fill(); } return; }
    if (f.rings) { rings(g, Math.min(w, h * 3.2), toneCol(tone, '#ffffff')); return; }
    if (f.star) { star(g, Math.min(w, h) * 0.5, toneCol(tone, '#c9ccd1')); return; }
    if (f.oval) { const rx = Math.min(w * 0.5, h * 0.95) * MM, ry = rx * 0.38; g.fillStyle = '#133a7c'; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 7); g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = ry * 0.12; g.stroke(); styledText(g, 'Ford', ry * 1.15 / MM, '#ffffff', { w: 700, it: 1, ff: 'Georgia, serif' }); return; }
    if (f.bull) { bullMark(g, Math.min(w, h * 1.8)); return; }
    // fit the wordmark inside w x h
    g.save(); g.font = (f.it ? 'italic ' : '') + f.w + ' 100px "Titillium Web", Arial, sans-serif'; const tw = g.measureText(f.n).width * (1 + (f.ls || 0) * 0.5) / 100;
    const cap = Math.min(h * 0.82, w * 0.95 / Math.max(0.1, tw)); styledText(g, f.n, cap, toneCol(tone, f.col), { w: f.w, it: f.it, ls: f.ls }); g.restore();
  }
  // the side-view drawing kit (metres -> mm canvas units): used by carglb.js, teams.js and the team files as L.k
  function sideKit(g, s) {   // drawing helpers for one side (s = -1 left side: tail to the right; +1 right side)
    const X = (x) => s * x * MM, Y = (y) => -y * MM;
    const path = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); };
    // a smooth open curve through points (Catmull-Rom), as a stroke or as the top edge of a filled region down/up to yEdge
    const curve = (pts, close) => {
      g.beginPath(); g.moveTo(X(pts[0][0]), Y(pts[0][1]));
      for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        g.bezierCurveTo(X(p1[0] + (p2[0] - p0[0]) / 6), Y(p1[1] + (p2[1] - p0[1]) / 6), X(p2[0] - (p3[0] - p1[0]) / 6), Y(p2[1] - (p3[1] - p1[1]) / 6), X(p2[0]), Y(p2[1])); }
      if (close) for (const q of close) g.lineTo(X(q[0]), Y(q[1]));
    };
    return {
      s, X, Y, path, curve,
      poly(pts, col) { path(pts); g.fillStyle = col; g.fill(); },
      // fill the region bounded by a curve and closing points (e.g. up to the top of the view)
      region(pts, close, col) { curve(pts, close); g.closePath(); g.fillStyle = col; g.fill(); },
      stroke(pts, w, col) { curve(pts); g.strokeStyle = col; g.lineWidth = w * MM; g.lineCap = 'round'; g.stroke(); },
      at(x, y, fn) { g.save(); g.translate(X(x), Y(y)); fn(); g.restore(); },
      // a decal (EI.Ads.drawDecal spec) centred at (x, y); cap = cap height (m), maxW (m)
      decal(spec, x, y, cap, maxW) { g.save(); g.translate(X(x), Y(y)); EI.Ads.drawDecal(g, spec, 0, 0, cap * MM, maxW * MM); g.restore(); },
      text(str, x, y, cap, col, font, o) { o = o || {}; g.save(); g.translate(X(x), Y(y)); if (o.skew) g.transform(1, 0, -o.skew, 1, 0, 0); g.font = font.replace('%', (cap * MM).toFixed(1) + 'px'); if (EI.Ads) EI.Ads.setLS(g, (o.ls || 0) * cap * MM); g.textAlign = o.align || 'center'; g.textBaseline = 'middle'; if (o.outline) { g.lineWidth = o.outline[0] * MM; g.strokeStyle = o.outline[1]; g.lineJoin = 'round'; g.strokeText(str, 0, 0); } g.fillStyle = col; g.fillText(str, 0, cap * MM * 0.04); if (EI.Ads) EI.Ads.setLS(g, 0); g.restore(); },
    };
  }
  // ---------------------------------------------------------------- team emblems (procedural, simplified)
  function rings(g, w, col) {   // Audi four rings, w = overall width (m)
    const r = w / (2 + 3 * 1.38) * MM, step = r * 1.38; g.strokeStyle = col; g.lineWidth = r * 0.2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc((i - 1.5) * step, 0, r, 0, 7); g.stroke(); }
  }
  function star(g, R, col, ring) {   // three-pointed star in a ring, R = radius (m)
    R *= MM; g.fillStyle = col; g.strokeStyle = col;
    if (ring !== false) { g.lineWidth = R * 0.09; g.beginPath(); g.arc(0, 0, R, 0, 7); g.stroke(); }
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; const c = Math.cos(a), s = Math.sin(a), ca = Math.cos(a + Math.PI / 2), sa = Math.sin(a + Math.PI / 2); const w = R * 0.15;
      g.beginPath(); g.moveTo(c * R * 0.93, s * R * 0.93); g.lineTo(ca * w, sa * w); g.lineTo(-ca * w, -sa * w); g.closePath(); g.fill(); }
  }
  function bullMark(g, w) {   // sun disc + two charging bulls, w = overall width (m)
    w *= MM; const r = w * 0.2; g.fillStyle = '#ffc906'; g.beginPath(); g.arc(0, -r * 0.1, r, 0, 7); g.fill();
    for (const s of [-1, 1]) {
      g.save(); g.scale(s, 1); g.fillStyle = '#db0a40'; g.beginPath();
      g.moveTo(w * 0.04, r * 0.1); g.lineTo(w * 0.16, -r * 0.55); g.lineTo(w * 0.24, -r * 0.62); g.lineTo(w * 0.42, -r * 0.5); g.lineTo(w * 0.5, -r * 0.1);
      g.lineTo(w * 0.47, r * 0.55); g.lineTo(w * 0.38, r * 0.3); g.lineTo(w * 0.3, r * 0.62); g.lineTo(w * 0.24, r * 0.3); g.lineTo(w * 0.14, r * 0.55); g.lineTo(w * 0.12, r * 0.2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(w * 0.08, -r * 0.05); g.lineTo(w * 0.0, -r * 0.42); g.lineTo(w * 0.13, -r * 0.3); g.fill(); g.restore();
    }
  }
  function shield(g, h, col, stripes) {   // Ferrari-style shield: yellow field, tricolore top, prancing silhouette simplified as "SF"
    h *= MM; const w = h * 0.72; g.fillStyle = col; g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2); g.lineTo(w / 2, h * 0.12); g.quadraticCurveTo(w / 2, h * 0.38, 0, h / 2); g.quadraticCurveTo(-w / 2, h * 0.38, -w / 2, h * 0.12); g.closePath(); g.fill();
    if (stripes) { const sh = h * 0.1; ['#009246', '#ffffff', '#ce2b37'].forEach((c, i) => { g.fillStyle = c; g.fillRect(-w / 2 + i * w / 3, -h / 2, w / 3, sh); }); }
    g.fillStyle = '#111111'; g.font = '900 ' + (h * 0.42).toFixed(1) + 'px "Titillium Web", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SF', 0, h * 0.12);
  }
  function alpineA(g, h, col) { h *= MM; const w = h * 0.95; g.fillStyle = col; g.beginPath(); g.moveTo(-w / 2, h / 2); g.lineTo(0, -h / 2); g.lineTo(w / 2, h / 2); g.lineTo(w * 0.28, h / 2); g.lineTo(0, -h * 0.02); g.lineTo(-w * 0.12, h * 0.25); g.lineTo(w * 0.08, h * 0.25); g.lineTo(w * 0.0, h * 0.42); g.lineTo(-w * 0.2, h * 0.42); g.lineTo(-w * 0.28, h / 2); g.closePath(); g.fill(); }
  function speedmark(g, w, col) { w *= MM; g.fillStyle = col; g.beginPath(); g.moveTo(-w / 2, w * 0.12); g.quadraticCurveTo(-w * 0.05, -w * 0.32, w / 2, -w * 0.18); g.quadraticCurveTo(w * 0.05, -w * 0.12, -w * 0.28, w * 0.12); g.closePath(); g.fill(); }
  function williamsW(g, h, col) { h *= MM; g.strokeStyle = col; g.lineWidth = h * 0.14; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(-h * 0.7, -h * 0.45); g.lineTo(-h * 0.35, h * 0.45); g.lineTo(0, -h * 0.2); g.lineTo(h * 0.35, h * 0.45); g.lineTo(h * 0.7, -h * 0.45); g.stroke(); }
  function cadCrest(g, h, col) { h *= MM; const w = h * 0.8; g.strokeStyle = col; g.lineWidth = h * 0.07; g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2); g.lineTo(w * 0.42, h * 0.1); g.lineTo(0, h / 2); g.lineTo(-w * 0.42, h * 0.1); g.closePath(); g.stroke();
    g.fillStyle = col; for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) g.fillRect(-w * 0.36 + i * w * 0.24, -h * 0.4 + j * h * 0.25, w * 0.24, h * 0.25); }
  const EMBLEM = { rings, star, bullMark, shield, alpineA, speedmark, williamsW, cadCrest };

  // ---------------------------------------------------------------- slots: where partner logos sit on this car model
  // side slots (x, y centre; w, h box; metres); top slots (x, z centre; w along z, h along x; rot = text along the car)
  const SIDE = {
    sp: [-0.2, 0.43, 0.82, 0.17], spLow: [-0.15, 0.27, 0.62, 0.075], spFront: [0.72, 0.47, 0.38, 0.1], ec: [-0.62, 0.885, 0.95, 0.11],
    ecRear: [-1.5, 0.52, 0.5, 0.16], noseSide: [2.0, 0.39, 0.55, 0.075], cockpit: [1.3, 0.62, 0.36, 0.06], airbox: [-0.12, 0.93, 0.28, 0.07],
    rwEnd: [-2.13, 0.84, 0.36, 0.13], rwEndLow: [-2.13, 0.6, 0.36, 0.1], fwEnd: [2.68, 0.18, 0.36, 0.1], floor: [0.6, 0.155, 0.6, 0.04],
    haloSide: [0.6, 0.885, 0.6, 0.035], haloPillar: [1.12, 0.78, 0.08, 0.1], mirror: [0.8, 0.72, 0.2, 0.05],
  };
  const TOP = { noseTop: [1.62, 0, 0.17, 0.22], rwTop: [-2.1, 0, 0.9, 0.12], spTop: [0.35, 0.4, 0.42, 0.13, 1], ecTop: [-0.9, 0, 0.2, 0.5, 1], fwTop: [2.75, 0.62, 0.42, 0.1],
    haloFront: [0.76, 0, 0.12, 0.07], mirrorTop: [0.8, 0.52, 0.16, 0.08] };
  // centre line of the halo's top bar (x, |z|), rear mount -> front pillar (measured from the model)
  const HALO_ARM = [[0.02, 0.32], [0.2, 0.32], [0.34, 0.295], [0.45, 0.245], [0.54, 0.17], [0.61, 0.09], [0.67, 0.02]];
  // Paintable areas (all carry the livery sheet): body, halo (top bar / sides / front pillar), mirrors, front-wing endplates + flaps,
  // rear-wing endplates / main plane / flap, fins. The T-cam on the airbox is not on the sheet: it is black on a team's first car and
  // fluorescent yellow on the second (carglb.js uTcam).

  // ---------------------------------------------------------------- per-team designs
  // L (side): { g, k, s, P, S, A, num, code, team, partner(id, slot, tone), emblem(name, x, y, ...args), number(x, y, cap, col),
  //             codeText(x, y, cap, col) }
  // L (top):  { g, t: { at, rect, poly }, partner(id, slot, tone), number(x, z, cap, col), emblem(name, x, z, ...args) }
  const W = '#ffffff';
  const D = {};   // team designs, registered by js/liveries/<teamId>.js (one file per team, loaded after this core)
  // ---------------------------------------------------------------- the painter API used by carglb.js
  // part keys (colour roles of the model's painted parts) and their defaults from the team colours
  const PART_KEYS = ['body', 'fwFlap', 'fwEnd', 'fwTip', 'rwMain', 'rwEnd', 'rwFlap', 'halo', 'mirror', 'fin', 'fwMain'];
  function partColours(team) {
    const d = D[team.id]; const p = (d && d.parts) || {};
    const def = { body: team.primary, fwFlap: team.secondary, fwEnd: team.primary, fwTip: team.primary, rwMain: team.primary, rwEnd: team.secondary, rwFlap: team.secondary, halo: null, mirror: team.primary, fin: team.secondary };
    const out = {}; for (const key of PART_KEYS) out[key] = p[key] || def[key]; return out;
  }
  function helpersSide(g, k, team, num, code, haloOn, noCar) {
    const d = D[team.id]; const st = (d && d.num) || {};
    const at = (x, y, fn) => k.at(x, y, fn);
    return {
      g, k, s: k.s, team, num, code,
      partner(id, slot, tone) { const b = SIDE[slot]; if (!b) return; at(b[0], b[1], () => partner(g, id, b[2], b[3], tone)); },
      partnerAt(id, x, y, w, h, tone, plate) { at(x, y, () => partner(g, id, w, h, tone, plate)); },
      emblem(name, x, y, ...args) { at(x, y, () => EMBLEM[name](g, ...args)); },
      mark(id, x, y, w, h, tone, name, ...args) { at(x, y, () => (EI.Ads && EI.Ads.hasPartner && EI.Ads.hasPartner(id) ? partner(g, id, w, h, tone) : EMBLEM[name](g, ...args))); },
      number(x, y, cap, col) { if (!noCar) at(x, y, () => styledText(g, String(num), cap, col, st)); },
      // per-car drawing that is not a number / code (e.g. the driver's flag): fn(g, k) gets the real canvas + kit in every pass
      car(fn) { if (!noCar) fn(g, k); },
      codeText(x, y, cap, col) { if (code && !noCar) at(x, y, () => styledText(g, code, cap, col, { ff: st.ff, w: st.w, it: st.it, sx: st.sx, skew: st.skew, ls: 0.06 })); },
      wordmark(str, x, y, cap, col, o) { if (noCar && isCarText(str, num, code)) return; at(x, y, () => styledText(g, str, cap, col, o)); },
      // text along the halo side (e.g. a team / driver handle), fitted to the bar
      haloSide(str, col, o) { if (!haloOn) return; const b = SIDE.haloSide; at(b[0], b[1], () => styledText(g, str, b[3] * 0.8, col, Object.assign({ w: 700, ls: 0.02 }, o))); },
      // a handle on the halo ARM as the driver sees it from the cockpit (arm -1 = left, +1 = right): the inner face of an arm takes
      // the OPPOSITE side view, so it is drawn there only (it also shows on the outside of the other arm, as on the real cars)
      haloHandle(str, col, arm, o) { if (k.s === -arm) this.haloSide(str, col, o); },
    };
  }
  function helpersTop(g, t, team, num, haloOn, noCar) {
    const d = D[team.id]; const st = (d && d.num) || {};
    return {
      g, t, team, num,
      partner(id, slot, tone) { const b = TOP[slot]; if (!b) return; const n = b[1] ? 2 : 1;
        for (let i = 0; i < n; i++) { const z = b[1] * (i ? -1 : 1); t.at(b[0], z, () => partner(g, id, b[4] ? b[3] : b[2], b[4] ? b[2] : b[3], tone), b[4] ? (z < 0 ? Math.PI / 2 : -Math.PI / 2) : 0); } },
      partnerTop(id, x, z, w, h, tone, rot, plate) { t.at(x, z, () => partner(g, id, w, h, tone, plate), rot || 0); },
      emblem(name, x, z, ...args) { t.at(x, z, () => EMBLEM[name](g, ...args)); },
      mark(id, x, z, w, h, tone, name, ...args) { t.at(x, z, () => (EI.Ads && EI.Ads.hasPartner && EI.Ads.hasPartner(id) ? partner(g, id, w, h, tone) : EMBLEM[name](g, ...args))); },
      number(x, z, cap, col) { if (!noCar) t.at(x, z, () => styledText(g, String(num), cap, col, st), Math.PI); },   // reads from the front
      car(fn) { if (!noCar) fn(g, t); },
      wordmark(str, x, z, cap, col, o, along, rot) { if (noCar && isCarText(str, num)) return; t.at(x, z, () => styledText(g, str, cap, col, o), rot != null ? rot : along ? -Math.PI / 2 : 0); },
      // text along one arm of the halo's top bar, reading from the cockpit with the letters' tops outward (side -1 left arm,
      // +1 right arm), e.g. a team / driver handle like '@McLarenF1'; cap = letter height (m, the bar is ~0.07 wide)
      haloTop(str, col, side, o, cap) { if (!haloOn) return; const pts = HALO_ARM.map(([x, z]) => [z * (side < 0 ? -1 : 1) * MM, -x * MM]); if (side > 0) pts.reverse(); textOnPath(g, str, pts, cap || 0.04, col, o); },
      haloFront(id, tone) { if (!haloOn) return; const b = TOP.haloFront; t.at(b[0], b[1], () => partner(g, id, b[2], b[3], tone)); },
    };
  }
  let PASS = 'all';
  const isCarText = (str, num, code) => str != null && ((num != null && String(str) === String(num)) || (code && String(str) === code) || (num != null && String(str) === '#' + num));
  // run one design part (side-type) in the current pass
  function passSide(fn, g, k, team, num, code) {
    if (PASS !== 'car') return fn(helpersSide(g, k, team, num, code, false, PASS === 'team'));
    const dg = scratch(); const L = helpersSide(dg, sideKit(dg, k.s), team, num, code, false, true), R = helpersSide(g, k, team, num, code, false, false);
    L.number = R.number; L.codeText = R.codeText; L.car = R.car; L.wordmark = function (str, ...a) { if (isCarText(str, num, code)) R.wordmark(str, ...a); };
    fn(L);
  }
  function passTop(fn, g, t, team, num) {
    if (PASS !== 'car') return fn(helpersTop(g, t, team, num, false, PASS === 'team'));
    const dg = scratch(); const nop = () => { }; const dt = { at: (x, z, f) => f(), rect: nop, poly: nop, txt: nop, dec: nop };
    const L = helpersTop(dg, dt, team, num, false, true), R = helpersTop(g, t, team, num, false, false);
    L.number = R.number; L.car = R.car; L.wordmark = function (str, ...a) { if (isCarText(str, num)) R.wordmark(str, ...a); };
    fn(L);
  }
  let scratchCtx = null;
  const scratch = () => { if (!scratchCtx) { const c = document.createElement('canvas'); c.width = c.height = 1; scratchCtx = c.getContext('2d'); } scratchCtx.setTransform(1, 0, 0, 1, 0, 0); return scratchCtx; };
  // the faces the numbers / wordmarks use must be loaded before the first livery is painted (Ads.ready() awaits Ads.FONTS)
  if (EI.Ads && Array.isArray(EI.Ads.FONTS)) ['900 24px "Titillium Web"', '700 24px "Titillium Web"', '600 24px "Titillium Web"', 'italic 900 24px "Titillium Web"', 'italic 700 24px "Titillium Web"']
    .forEach(f => { if (EI.Ads.FONTS.indexOf(f) < 0) EI.Ads.FONTS.push(f); });
  EI.LIVERIES = {
    register(id, design) { D[id] = design; },
    K: { TOP_V, LOW_V, W, MM, SIDE, TOP },
    sideKit, has: (id) => !!D[id], designs: D, PART_KEYS, partColours, slug, styledText, textOnPath, partner, EMBLEM,
    side(g, k, team, num, code) { const d = D[team.id]; if (d) passSide(d.side, g, k, team, num, code); },
    // front-wing endplates (optional per design): same side coordinates as side(); only the endplate texels receive it
    hasEndplate: (id) => !!(D[id] && D[id].endplate),
    // front-wing main planes (optional per design; part key fwMain, default bare carbon): top-view coordinates / helpers as top(L),
    // x 2.15..3.25, z -1..1; only the main-plane texels receive it (also their front / rear faces)
    hasFrontWing: (id) => !!(D[id] && D[id].frontWing),
    frontWing(g, t, team, num) { const d = D[team.id]; if (d && d.frontWing) passTop(d.frontWing, g, t, team, num); },
    endplate(g, k, team, num, code) { const d = D[team.id]; if (d && d.endplate) passSide(d.endplate, g, k, team, num, code); },
    top(g, t, team, num) { const d = D[team.id]; if (d) passTop(d.top, g, t, team, num); },
    // Two-pass painting (carglb.js): PASS 'team' paints everything except the per-car content (number, code, L.car(...), a
    // wordmark whose text is exactly the number / code) into a sheet shared by the team's cars; PASS 'car' paints ONLY that
    // per-car content on a copy of it. 'all' (default) = both at once. splitOK(id): the design can be split (not the own teams,
    // whose designs draw the number with the raw kit).
    setPass(p) { PASS = p || 'all'; }, splitOK: (id) => !!(D[id] && !D[id].own),
    // halo passes: only the halo helpers (haloSide / haloHandle / haloTop / haloFront) draw, into views that reach ONLY the halo's
    // texels; the rest of the design runs against a 1 px scratch canvas. So halo text never spills onto the bodywork and the body's
    // colour blocks stay off the halo (it keeps its part colour, parts.halo).
    sideHalo(g, k, team, num, code) {
      const d = D[team.id]; if (!d || PASS === 'car') return; const dg = scratch(); const R = helpersSide(g, k, team, num, code, true);
      const L = helpersSide(dg, sideKit(dg, k.s), team, num, code, false); L.haloSide = R.haloSide.bind(R); L.haloHandle = R.haloHandle.bind(R);
      d.side(L);
    },
    topHalo(g, t, team, num) {
      const d = D[team.id]; if (!d || PASS === 'car') return; const dg = scratch(); const R = helpersTop(g, t, team, num, true);
      const nop = () => { }; const dt = { at: (x, z, fn) => fn(), rect: nop, poly: nop, txt: nop, dec: nop };
      const L = helpersTop(dg, dt, team, num, false); L.haloTop = R.haloTop.bind(R); L.haloFront = R.haloFront.bind(R);
      d.top(L);
    },
    numStyle: (team) => (D[team.id] && D[team.id].num) || {},
    // wheel cover (S x S canvas = the 0.56 m disc, centre S/2; the visible cover is a ring r 0.05..0.27 m = S*0.09..S*0.48):
    // default = dark satin with a team-colour ring and the team wordmark; a design may override with design.cover(g, S, team)
    cover(g, S, team) {
      const d = D[team.id]; if (d && d.cover) return d.cover(g, S, team);
      const r = (m) => m / 0.56 * S; const cx = S / 2;
      g.fillStyle = '#141518'; g.beginPath(); g.arc(cx, cx, r(0.27), 0, 7); g.fill();
      g.strokeStyle = team.primary; g.lineWidth = r(0.012); g.beginPath(); g.arc(cx, cx, r(0.25), 0, 7); g.stroke();
      g.save(); g.translate(cx, cx + r(0.16)); styledText(g, (team.brand || team.name).toUpperCase(), r(0.032) / MM, '#e8e8e8', { w: 700, ls: 0.12 }); g.restore();
    },
    // driver helmet (256 x 128 canvas; x: 0 = back, 64 = left side, 128 = visor centre, 192 = right side, 256 = back; y: 0 = crown,
    // 128 = neck). driver.helmetSpec = { base, c2, c3, pattern: 'band' | 'stripe' | 'split' | 'chevron' | 'halves', num: bool }
    // (from the 2026 helmet photos); a design may override with design.helmet(g, W, H, driver, team, num). Text is drawn mirrored
    // (the mapping flips it), so the number reads correctly on both sides.
    helmet(g, W, H, driver, team, num) {
      const d = D[team.id]; if (d && d.helmet) return d.helmet(g, W, H, driver, team, num);
      const sp = (driver && driver.helmetSpec) || null; const base = (sp && sp.base) || (driver && driver.helmet) || team.accent;
      if (!sp) { g.fillStyle = base; g.fillRect(0, 0, W, H); return; }   // no verified design: the plain per-driver colour
      const c2 = sp.c2 || (lum(base) > 0.6 ? team.primary : '#ffffff'), c3 = sp.c3 || (lum(c2) > 0.6 ? '#16181c' : '#ffffff');
      g.fillStyle = base; g.fillRect(0, 0, W, H);
      const pat = sp.pattern || 'band';
      if (pat === 'band' || pat === 'chevron') { g.fillStyle = c2; g.fillRect(0, H * 0.48, W, H * 0.16); g.fillStyle = c3; g.fillRect(0, H * 0.46, W, H * 0.025); g.fillRect(0, H * 0.64, W, H * 0.025); }
      if (pat === 'chevron') { g.fillStyle = c2; g.beginPath(); g.moveTo(W * 0.5, H * 0.75); g.lineTo(W * 0.2, H * 0.1); g.lineTo(W * 0.3, H * 0.1); g.lineTo(W * 0.5, H * 0.55); g.lineTo(W * 0.7, H * 0.1); g.lineTo(W * 0.8, H * 0.1); g.closePath(); g.fill(); }
      if (pat === 'stripe') { g.fillStyle = c2; g.fillRect(0, 0, W, H * 0.12); g.fillRect(W * 0.46, 0, W * 0.08, H * 0.6); g.fillRect(0, 0, W * 0.04, H * 0.6); g.fillRect(W * 0.96, 0, W * 0.04, H * 0.6); }
      if (pat === 'split') { g.fillStyle = c2; g.fillRect(W * 0.5, 0, W * 0.5, H); }
      if (pat === 'halves') { g.fillStyle = c2; g.fillRect(0, H * 0.5, W, H * 0.5); g.fillStyle = c3; g.fillRect(0, H * 0.48, W, H * 0.04); }
      if (sp.num !== false && num != null) for (const x of [W * 0.25, W * 0.75]) { g.save(); g.translate(x, H * 0.36); g.scale(-1, 1); styledText(g, String(num), H * 0.22 / MM, c3 === base ? c2 : c3, { w: 900 }); g.restore(); }
      // visor strip above the visor (sponsor band on real helmets)
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(W * 0.38, H * 0.3, W * 0.24, H * 0.06);
    },
  };
})();
