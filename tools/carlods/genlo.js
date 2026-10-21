// Offline generator for the 'lo' car (bots near the camera, the player's own car on Low, the mirrors): every mesh of ei-car-hi.glb
// simplified by edge collapse (meshoptimizer, vendor/, MIT) to the triangle count of the same mesh in ei-car-lo.glb, keeping UV seams
// and weighting UVs / normals, so the livery atlas (laid out on the hi car) maps onto the lo car the way it maps onto the hi car.
// (The shipped ei-car-lo.glb's own UVs are distorted: liveries came out with torn, saw-toothed edges on its nose / wings.)
// Output assets/models/ei-car-lohi.bin = per hi mesh an index list into that mesh's vertices; js/carglb.js loFromHi() rebuilds the lo
// car from it at load. Run before gen.js (whose LODs are made from this lo car): node tools/carlods/genlo.js && node tools/carlods/gen.js
const fs = require('fs'), path = require('path'); const MS = require('./vendor/meshopt_simplifier.cjs');
const REPO = path.resolve(__dirname, '../..'); const OUT = process.argv[2] || path.join(REPO, 'assets/models/ei-car-lohi.bin');
(async () => {
  await MS.ready; const { glb, C } = await require('./load.js').env(REPO);
  const hi = (await glb('ei-car-hi.glb')).scene, lo = (await glb('ei-car-lo.glb')).scene;
  const hm = [], lm = {}; hi.traverse((o) => { if (o.isMesh) hm.push(o); }); lo.traverse((o) => { if (o.isMesh) lm[o.name] = o; });
  const lists = []; let tin = 0, tout = 0;
  for (const o of hm) {
    const g = o.geometry, P = g.attributes.position.array, N = g.attributes.normal.array, UV = g.attributes.uv.array, nv = P.length / 3, ix = new Uint32Array(g.index.array);
    const target = lm[o.name] ? lm[o.name].geometry.index.count / 3 : ix.length / 3;
    const painted = (o.material && (o.material.name === 'paint' || o.material.name === 'cover' || o.material.name === 'helmet')) || o.name === 'halo_main', wu = painted ? 3 : 1;
    const at = new Float32Array(nv * 5); for (let i = 0; i < nv; i++) { at[i * 5] = N[i * 3]; at[i * 5 + 1] = N[i * 3 + 1]; at[i * 5 + 2] = N[i * 3 + 2]; at[i * 5 + 3] = UV[i * 2]; at[i * 5 + 4] = UV[i * 2 + 1]; }
    let out = ix; if (target * 3 < ix.length) [out] = MS.simplifyWithAttributes(ix, P, 3, at, 5, [0.5, 0.5, 0.5, wu, wu], null, target * 3, 1, []);
    lists.push(out); tin += target; tout += out.length / 3;
    if (process.env.V) console.log(o.name.padEnd(22), 'hi', ix.length / 3, 'lo glb', target, 'new', out.length / 3);
  }
  // file: 'EIH1', u32 mesh count, f64 checksum of the hi meshes' positions (C.loChecksum), per mesh: u32 index count + u16 indices (4-byte padded)
  let size = 16; for (const l of lists) size += 4 + Math.ceil(l.length * 2 / 4) * 4;
  const buf = new ArrayBuffer(size), dv = new DataView(buf); let o = 0; for (const ch of 'EIH1') dv.setUint8(o++, ch.charCodeAt(0));
  dv.setUint32(o, hm.length, true); o += 4; dv.setFloat64(o, C.loChecksum(hm), true); o += 8;
  for (const l of lists) { dv.setUint32(o, l.length, true); o += 4; for (let i = 0; i < l.length; i++) { dv.setUint16(o, l[i], true); o += 2; } o = Math.ceil(o / 4) * 4; }
  fs.writeFileSync(OUT, Buffer.from(buf)); console.log('wrote', OUT, size, 'bytes,', hm.length, 'meshes, tris target', tin, 'made', tout);
})().catch((e) => { console.error(e); process.exit(1); });
