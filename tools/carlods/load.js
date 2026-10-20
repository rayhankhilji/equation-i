// node: load the game's three.js r128, GLTFLoader and js/carglb.js (no browser) and build the lo car's LOD source geometry
// (carglb template('lo') with T.all kept) -> { T, parts: [{ name, v0, n }] }: the merged vertex array ei-car-lods.bin indexes into
const fs = require('fs'), path = require('path');
module.exports = async function (repo) {
  global.self = global; global.window = global; global.EI = global.EI || {};
  global.document = global.document || { createElement: () => ({ getContext: () => null, width: 1, height: 1 }) };
  const THREE = require(path.join(repo, 'vendor/three.min.js')); global.THREE = THREE;
  eval(fs.readFileSync(path.join(repo, 'vendor/GLTFLoader.js'), 'utf8'));
  require(path.join(repo, 'js/carglb.js'));
  const glb = (f) => { const b = fs.readFileSync(path.join(repo, 'assets/models', f)); return new Promise((res, rej) => new THREE.GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej)); };
  const C = EI.CarGLB, hi = await glb('ei-car-hi.glb'), lo = await glb('ei-car-lo.glb');
  C.cache.hi = hi.scene; C.cache.lo = lo.scene; C.cache.meta = hi.scene.userData && hi.scene.userData.anchors ? hi.scene.userData : (lo.scene.userData || {});
  C.keepAll = true; C.noLods = true;
  const T = C.template('lo', false); const parts = []; let v = 0;
  for (const [name, n] of T.allParts) { parts.push({ name, v0: v, n }); v += n; }
  if (v !== T.all.attributes.position.count) throw new Error('allParts do not cover T.all');
  return { T, parts, C };
};
