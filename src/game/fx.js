// Efeitos: fumaça de pneu, poeira de areia, faíscas e marcas de pneu.
import * as THREE from 'three';

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

class ParticlePool {
  constructor(scene, n, additive, tex) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.size = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.col = new Float32Array(n * 3);
    this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uScale: { value: 600 }, uLight: { value: 1 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC;
        uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale / max(0.5, -mv.z); vA = aAlpha; vC = aColor; }`,
      fragmentShader: `uniform sampler2D uTex; uniform float uLight; varying float vA; varying vec3 vC;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * uLight, t.a * vA); if (gl_FragColor.a < 0.004) discard; }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(p, v, life, size, grow, color) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow;
    this.col.set([color.r, color.g, color.b], i * 3);
  }
  update(dt, gravity, drag, fadeIn) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= gravity * dt;
      const d = Math.exp(-drag * dt);
      this.vel[k] *= d; this.vel[k + 1] *= d; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (gravity > 0 && this.pos[k + 1] < 0.02) { this.pos[k + 1] = 0.02; this.vel[k + 1] *= -0.35; this.vel[k] *= 0.6; this.vel[k + 2] *= 0.6; }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      this.alpha[i] = fadeIn ? Math.min(1, (1 - t) * 6) * t : t;
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.aSize.needsUpdate = true; a.aAlpha.needsUpdate = true; a.aColor.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    const tex = softTex();
    this.smoke = new ParticlePool(scene, 420, false, tex);
    this.sparks = new ParticlePool(scene, 260, true, tex);
    // marcas de pneu: fita de quads
    this.skidN = 900;
    const g = new THREE.BufferGeometry();
    this.skidPos = new Float32Array(this.skidN * 4 * 3);
    this.skidA = new Float32Array(this.skidN * 4);
    const idx = [];
    for (let i = 0; i < this.skidN; i++) { const b = i * 4; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    g.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.skidA, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.015, 0.015, 0.015, vA); }',
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    this.skidMesh = new THREE.Mesh(g, m);
    this.skidMesh.frustumCulled = false;
    this.skidMesh.renderOrder = 1;
    scene.add(this.skidMesh);
    this.skidI = 0;
    this.lastSkid = null;
    this._v = new THREE.Vector3(); this._p = new THREE.Vector3();
    this.smokeCol = new THREE.Color(0.85, 0.85, 0.85);
    this.dustCol = new THREE.Color(0.75, 0.66, 0.5);
    this.sparkCol = new THREE.Color(4, 1.6, 0.4);
  }

  tireSmoke(p, intensity, fwd) {
    const n = Math.ceil(intensity * 2);
    for (let k = 0; k < n; k++) {
      this._v.set((Math.random() - 0.5) * 1.5 - fwd.x * 2, 0.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.5 - fwd.z * 2);
      this.smoke.emit(p, this._v, 1.6 + Math.random() * 1.4, 0.4, 1.8 + Math.random(), this.smokeCol);
    }
  }
  dust(p, intensity) {
    if (Math.random() > intensity) return;
    this._v.set((Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2);
    this.smoke.emit(p, this._v, 1.0 + Math.random(), 0.3, 1.2, this.dustCol);
  }
  spark(p, vel, n = 3) {
    for (let k = 0; k < n; k++) {
      this._v.set(vel.x + (Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, vel.z + (Math.random() - 0.5) * 3);
      this.sparks.emit(p, this._v, 0.25 + Math.random() * 0.35, 0.05 + Math.random() * 0.05, -0.05, this.sparkCol);
    }
  }

  // segmento de marca de pneu do ponto anterior até p (largura w)
  skid(p, dir, w, strength) {
    const last = this.lastSkid;
    if (!last || last.distanceTo(p) > 1.5) { this.lastSkid = p.clone(); return; }
    if (last.distanceTo(p) < 0.25) return;
    const rx = -dir.z * w, rz = dir.x * w;
    const i = this.skidI; this.skidI = (this.skidI + 1) % this.skidN;
    const y0 = last.y + 0.015, y1 = p.y + 0.015;
    this.skidPos.set([last.x - rx, y0, last.z - rz, last.x + rx, y0, last.z + rz, p.x - rx, y1, p.z - rz, p.x + rx, y1, p.z + rz], i * 12);
    const a = Math.min(0.75, strength);
    this.skidA.set([a, a, a, a], i * 4);
    this.lastSkid.copy(p);
    const at = this.skidMesh.geometry.attributes;
    at.position.needsUpdate = true; at.aA.needsUpdate = true;
  }
  breakSkid() { this.lastSkid = null; }

  update(dt, light) {
    this.smoke.mat.uniforms.uLight.value = light;
    this.smoke.update(dt, -0.4, 1.2, true);
    this.sparks.update(dt, 9.8, 0.5, false);
  }
}
