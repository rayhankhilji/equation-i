// Equation I - dust, gravel spray and tyre smoke as a single sprite-point system
window.EI = window.EI || {};
(function () {
  const U = EI.U;
  const MAX = 1200;
  class Particles {
    constructor(scene) {
      const geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3); this.size = new Float32Array(MAX); this.alpha = new Float32Array(MAX);
      this.vel = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.maxLife = new Float32Array(MAX); this.grow = new Float32Array(MAX);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      geo.setAttribute('psize', new THREE.BufferAttribute(this.size, 1)); geo.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1));
      const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d'); const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, scaleY: { value: 400 } }, transparent: true, depthWrite: false, blending: THREE.NormalBlending, vertexColors: true,
        vertexShader: 'attribute float psize; attribute float palpha; varying float vA; varying vec3 vC; uniform float scaleY; void main(){ vA = palpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * scaleY / -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform sampler2D map; varying float vA; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); }'
      });
      this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; this.points.visible = false; this.live = 0; this.n = 0; this.cursor = 0; scene.add(this.points); this.mat = mat;
      this.tmpC = new THREE.Color();
    }
    emit(x, y, z, vx, vy, vz, color, size, life, grow) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % MAX;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
      this.tmpC.set(color); this.col[i * 3] = this.tmpC.r; this.col[i * 3 + 1] = this.tmpC.g; this.col[i * 3 + 2] = this.tmpC.b;
      this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grow[i] = grow || 1; this.alpha[i] = 1; this.live = MAX;
    }
    // called per car per frame
    fromCar(car, dt) {
      const av = Math.abs(car.v); if (av < 3) return;
      const fx = Math.cos(car.heading), fz = Math.sin(car.heading), lx = fz, lz = -fx;
      const rear = (side) => [car.x - fx * 1.85 + lx * side * 0.95, car.y + 0.15, car.z - fz * 1.85 + lz * side * 0.95];
      if (car.surface === 'grass' || car.surface === 'gravel') {
        const gravel = car.surface === 'gravel'; const rate = (gravel ? 60 : 30) * Math.min(1, av / 30);
        if (Math.random() < rate * dt) for (const side of [-1, 1]) { const p = rear(side); this.emit(p[0], p[1], p[2], -fx * av * 0.15 + (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, -fz * av * 0.15 + (Math.random() - 0.5) * 2, gravel ? 0xc8b48a : 0x8a9a5a, gravel ? 1.2 : 1.6, 0.8 + Math.random() * 0.5, 2.2); }
      }
      // tyre smoke under heavy slip (lockups without ABS, big slides)
      const slip = Math.abs(car.vLat) > 3 || (car.brake > 0.9 && !car.assist.abs && av > 15);
      if (slip && Math.random() < 50 * dt) for (const side of [-1, 1]) { const p = rear(side); this.emit(p[0], p[1] + 0.1, p[2], (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5, 0xe8e8ec, 1.8, 1.2, 2.6); }
    }
    // only while something is alive: the loop and the four buffer uploads are skipped once every particle has faded
    update(dt) {
      if (!this.live) return; let alive = 0;
      for (let i = 0; i < MAX; i++) {
        if (this.life[i] <= 0) continue; this.life[i] -= dt; alive++;
        if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
        const t = this.life[i] / this.maxLife[i]; this.alpha[i] = t * 0.75; this.size[i] += this.grow[i] * dt;
        this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        this.vel[i * 3] *= 0.96; this.vel[i * 3 + 2] *= 0.96; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * 0.95 + 0.3 * dt;
      }
      this.live = alive; this.points.visible = alive > 0;
      const a = this.points.geometry.attributes; a.position.needsUpdate = true; a.palpha.needsUpdate = true; a.psize.needsUpdate = true; a.color.needsUpdate = true;
    }
    setViewportHeight(h) { this.mat.uniforms.scaleY.value = h * 0.55; }
  }
  EI.Particles = Particles;
})();
