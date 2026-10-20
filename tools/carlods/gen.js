// Offline LOD generator for the bot cars (js/carglb.js, the mid / far / vfar LODs): edge-collapse simplification (meshoptimizer,
// vendor/, MIT) of the lo car's merged geometry -> assets/models/ei-car-lods.bin, index lists into that vertex array, one per LOD.
// Run after changing assets/models/ei-car-lo.glb or carglb.js template(): node tools/carlods/gen.js [out.bin] [config.json]
const fs = require('fs'); const MS = require('./vendor/meshopt_simplifier.cjs');
const path = require('path'); const REPO = path.resolve(__dirname, '../..'); const OUT = process.argv[2] || path.join(REPO, 'assets/models/ei-car-lods.bin'); const CFG = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : require('./lodcfg.js');
function checksum(P) { let s = 0; for (let i = 0; i < P.length / 3; i++) s += (P[i * 3] + P[i * 3 + 1] * 3 + P[i * 3 + 2] * 7) * ((i % 13) + 1); return s; }
(async () => {
  await MS.ready; const { T, parts } = await require('./load.js')(REPO);
  const all = T.all, A = all.attributes, nv = A.position.count, P = A.position.array, N = A.normal.array, UV = A.uv.array, K = A.lodk.array, src = all.index.array;
  const owner = new Int32Array(nv); parts.forEach((p, k) => owner.fill(k, p.v0, p.v0 + p.n));
  const triOwner = (t) => owner[src[t]];
  const lods = [];
  for (const L of CFG.lods) {
    const drop = new RegExp(L.drop || '^$'); const keepPart = parts.map(p => !drop.test(p.name));
    const rawRe = new RegExp(L.raw || '^$'); const rawPart = parts.map(p => rawRe.test(p.name));
    let tris = [], raw = []; for (let t = 0; t < src.length; t += 3) { const o = triOwner(t); if (!keepPart[o]) continue; (rawPart[o] ? raw : tris).push(src[t], src[t + 1], src[t + 2]); }
    const idx = new Uint32Array(tris);
    // attributes: normal (3) + uv (2), uv only where it is sampled (livery slot 1, tyre wall slot 4)
    // + 3 'emphasis' channels: the position again, scaled per part (L.emph: [[regex, k]]), so a part with k > 0 pays extra for moving its
    // vertices off their place (silhouette-critical parts such as tyres / halo keep more of their shape)
    const ek = parts.map(p => { let k = 0; for (const [re, v] of (L.emph || [])) if (new RegExp(re).test(p.name)) { k = v; break; } return k; });
    const ST = 8, at = new Float32Array(nv * ST); for (let i = 0; i < nv; i++) { const s = K[i * 4]; at[i * ST] = N[i * 3]; at[i * ST + 1] = N[i * 3 + 1]; at[i * ST + 2] = N[i * 3 + 2]; const tex = (s > 0.5 && s < 1.5) || (s > 3.5 && s < 4.5); at[i * ST + 3] = tex ? UV[i * 2] : 0; at[i * ST + 4] = tex ? UV[i * 2 + 1] : 0; const e = ek[owner[i]]; at[i * ST + 5] = P[i * 3] * e; at[i * ST + 6] = P[i * 3 + 1] * e; at[i * ST + 7] = P[i * 3 + 2] * e; }
    const w = [L.wn, L.wn, L.wn, L.wuv, L.wuv, 1, 1, 1];
    // optional per-part locks (vertices that must not move: e.g. none)
    // groups: [regex, tris, flags?] simplified on their own with a fixed budget (silhouette-critical parts: rear wing, helmet ...);
    // everything else shares what is left of L.tris
    const res = [raw]; let rest = Array.from(idx), budget = L.tris - raw.length / 3, err = 0;
    for (const [re, gt, gf] of (L.groups || [])) { const R = new RegExp(re), mine = [], other = []; for (let t = 0; t < rest.length; t += 3) (R.test(parts[owner[rest[t]]].name) ? mine : other).push(rest[t], rest[t + 1], rest[t + 2]); rest = other;
      if (!mine.length) continue; const [g] = MS.simplifyWithAttributes(new Uint32Array(mine), P, 3, at, ST, w, null, Math.min(mine.length, gt * 3), 1, gf || L.flags || []); res.push(Array.from(g)); budget -= g.length / 3; }
    { const [simp, e] = MS.simplifyWithAttributes(new Uint32Array(rest), P, 3, at, ST, w, null, Math.round(budget * 3), L.err || 1, L.flags || []); res.push(Array.from(simp)); err = e; }
    const out = new Uint32Array(res.reduce((n, r) => n + r.length, 0)); { let o = 0; for (const r of res) { out.set(r, o); o += r.length; } }
    // per-part report
    const per = {}; for (let t = 0; t < out.length; t += 3) { const n = parts[owner[out[t]]].name; per[n] = (per[n] || 0) + 1; }
    console.log(L.name, 'in', idx.length / 3, 'out', out.length / 3, 'err', err.toFixed(5), 'abs m', (err * MS.getScale(P, 3)).toFixed(4));
    if (process.env.V) console.log(Object.entries(per).sort((a, b) => b[1] - a[1]).map(e => e[0] + ':' + e[1]).join(' '));
    lods.push({ name: L.name, idx: out });
  }
  // file: 'EIL1', u32 vertex count, f64 position checksum, u32 lod count, per lod: 4-char name, u32 index count, u16 indices (padded to 4 bytes)
  let size = 4 + 4 + 8 + 4; for (const l of lods) size += 8 + Math.ceil(l.idx.length * 2 / 4) * 4;
  const buf = new ArrayBuffer(size), dv = new DataView(buf); let o = 0;
  for (const ch of 'EIL1') dv.setUint8(o++, ch.charCodeAt(0)); dv.setUint32(o, nv, true); o += 4; dv.setFloat64(o, checksum(P), true); o += 8; dv.setUint32(o, lods.length, true); o += 4;
  for (const l of lods) { for (let q = 0; q < 4; q++) dv.setUint8(o++, (l.name.charCodeAt(q) || 32)); dv.setUint32(o, l.idx.length, true); o += 4; for (let i = 0; i < l.idx.length; i++) { dv.setUint16(o, l.idx[i], true); o += 2; } o = Math.ceil(o / 4) * 4; }
  if (OUT) { fs.writeFileSync(OUT, Buffer.from(buf)); console.log('wrote', OUT, size, 'bytes, verts', nv, 'checksum', checksum(P)); }
})().catch(e => { console.error(e); process.exit(1); });
