// node: load the game's three.js r128, GLTFLoader and js/carglb.js (no browser) and build the lo car's LOD source geometry
// (carglb template('lo') with T.all kept) -> { T, parts: [{ name, v0, n }] }: the merged vertex array ei-car-lods.bin indexes into.
// The lo car is made the way the game makes it: from ei-car-hi.glb + ei-car-lohi.bin (carglb loFromHi), else ei-car-lo.glb.
const fs = require('fs'), path = require('path');
async function env(repo) {
  global.self = global; global.window = global; global.EI = global.EI || {};
  global.document = global.document || { createElement: () => ({ getContext: () => null, width: 1, height: 1 }) };
  const THREE = require(path.join(repo, 'vendor/three.min.js')); global.THREE = THREE;
  if (!THREE.GLTFLoader) eval(fs.readFileSync(path.join(repo, 'vendor/GLTFLoader.js'), 'utf8'));
  if (!EI.CarGLB) require(path.join(repo, 'js/carglb.js'));
  const glb = (f) => { const b = fs.readFileSync(path.join(repo, 'assets/models', f)); return new Promise((res, rej) => new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
  return { THREE, glb, C: EI.CarGLB };
}
module.exports = async function (repo) {
  const { glb, C } = await env(repo);
  const hi = await glb('ei-car-hi.glb'); let lo = null;
  const lf = path.join(repo, 'assets/models/ei-car-lohi.bin');
  if (fs.existsSync(lf)) { const b = fs.readFileSync(lf); lo = C.loFromHi(hi.scene, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); }
  if (!lo) { console.warn('load.js: using ei-car-lo.glb (no matching ei-car-lohi.bin)'); lo = (await glb('ei-car-lo.glb')).scene; }
  C.cache.hi = hi.scene; C.cache.lo = lo; C.cache.meta = hi.scene.userData && hi.scene.userData.anchors ? hi.scene.userData : (lo.userData || {});
  C.keepAll = true; C.noLods = true;
  const T = C.template('lo', false); const parts = []; let v = 0;
  for (const [name, n] of T.allParts) { parts.push({ name, v0: v, n }); v += n; }
  if (v !== T.all.attributes.position.count) throw new Error('allParts do not cover T.all');
  return { T, parts, C };
};
module.exports.env = env;
