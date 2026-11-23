// Câmera: perseguição com mola, lateral cinematográfica, capacete (1ª pessoa), alta, órbita com mouse.
import * as THREE from 'three';

export const CAM_MODES = ['PERSEGUIÇÃO', 'PERTO', 'LATERAL', 'CAPACETE', 'ALTA'];
const V = () => new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.mode = 0;
    this.pos = V().set(0, 3, -8);
    this.look = V();
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.shake = 0;
    this.roll = 0;
    this.fov = 62;
    this._t = 0;
    this.tmp = V(); this.tmp2 = V(); this.up = V().set(0, 1, 0);
  }

  next() { this.mode = (this.mode + 1) % CAM_MODES.length; return CAM_MODES[this.mode]; }

  update(dt, P, bike, input, ground, opts = {}) {
    this._t += dt;
    const cam = this.cam;
    const fwd = V().set(Math.sin(P.h), 0, Math.cos(P.h));
    const right = V().set(-Math.cos(P.h), 0, Math.sin(P.h));
    const base = V().set(P.x, P.y, P.z);
    const speed = P.v;
    // órbita com o mouse (botão direito); volta ao centro ao soltar
    if (input.mouse.down) {
      this.orbitYaw -= input.mouse.dx * 0.005;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch - input.mouse.dy * 0.004, -0.4, 1.1);
    } else {
      this.orbitYaw *= Math.exp(-dt * 2.2);
      this.orbitPitch *= Math.exp(-dt * 2.2);
    }
    let desired, look, k = 1 - Math.exp(-dt * 7), fovT = 60 + Math.min(20, speed * 0.32);
    const wheelieLift = Math.max(0, P.pitch) * 0.6;
    if (opts.menu) {
      const a = this._t * 0.12;
      desired = base.clone().add(V().set(Math.sin(a) * 4.2, 1.35 + Math.sin(a * 0.7) * 0.2, Math.cos(a) * 4.2));
      look = base.clone().add(fwd.clone().multiplyScalar(0.7)).add(V().set(0, 0.75, 0));
      k = 1 - Math.exp(-dt * 3); fovT = 40;
    } else if (opts.garage) {
      const a = opts.garageAngle;
      desired = base.clone().add(V().set(Math.sin(a) * 3.6, 1.15, Math.cos(a) * 3.6));
      look = base.clone().add(fwd.clone().multiplyScalar(0.6)).add(V().set(0, 0.65, 0)).add(right.clone().multiplyScalar(-0.6));
      k = 1 - Math.exp(-dt * 4); fovT = 42;
    } else if (this.mode === 0 || this.mode === 1) {
      const far = this.mode === 0;
      const dist = (far ? 5.6 : 3.9) + Math.min(2.2, speed * 0.035) + wheelieLift * 1.4;
      const hgt = (far ? 1.85 : 1.45) + wheelieLift * 0.5;
      const yaw = this.orbitYaw;
      const dir = fwd.clone().applyAxisAngle(this.up, yaw);
      desired = base.clone().addScaledVector(dir, -dist * Math.cos(this.orbitPitch)).add(V().set(0, hgt + dist * Math.sin(this.orbitPitch), 0));
      look = base.clone().addScaledVector(fwd, 2.2 + Math.min(4, speed * 0.08)).add(V().set(0, 0.95 + wheelieLift * 0.8, 0));
      k = 1 - Math.exp(-dt * (far ? 6 : 8));
    } else if (this.mode === 2) {
      desired = base.clone().addScaledVector(right, 4.6).addScaledVector(fwd, 1.2 + Math.sin(this._t * 0.3) * 0.6).add(V().set(0, 0.9, 0));
      look = base.clone().addScaledVector(fwd, 0.7).add(V().set(0, 0.8, 0));
      k = 1 - Math.exp(-dt * 10); fovT = 50;
    } else if (this.mode === 3) {
      const head = bike.seg && bike.seg.head && !P.crashed ? bike.seg.head.getWorldPosition(V()) : base.clone().add(V().set(0, 1.5, 0));
      const pdir = fwd.clone().applyAxisAngle(right, P.pitch * 0.5);
      desired = head.add(V().set(0, 0.2, 0)).addScaledVector(fwd, 0.05);
      look = desired.clone().addScaledVector(pdir, 10).add(V().set(0, -1.3, 0)).addScaledVector(right, P.lean * 2);
      k = 1; fovT = 72 + Math.min(14, speed * 0.2);
    } else {
      desired = base.clone().addScaledVector(fwd, -11).add(V().set(0, 8.5, 0));
      look = base.clone().addScaledVector(fwd, 4);
      k = 1 - Math.exp(-dt * 5);
    }
    // colisão com prédios: aproxima a câmera se houver parede entre ela e a moto
    if (opts.collide && this.mode !== 3) {
      const from = this.tmp.set(P.x, P.y + 1.0, P.z);
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + (desired.x - from.x) * t, z = from.z + (desired.z - from.z) * t;
        const hit = opts.collide(x, z, 0.35);
        if (hit && hit.kind === 'building') {
          const tt = Math.max(0.15, (i - 1) / steps);
          desired.set(from.x + (desired.x - from.x) * tt, desired.y, from.z + (desired.z - from.z) * tt);
          k = Math.max(k, 0.5);
          break;
        }
      }
    }
    if (this.snapNext) { k = 1; this.snapNext = false; this.look.copy(look); }
    this.pos.lerp(desired, k);
    // não entra no chão
    const gh = ground(this.pos.x, this.pos.z) + 0.35;
    if (this.pos.y < gh) this.pos.y = gh;
    this.look.lerp(look, this.mode === 3 && !opts.menu && !opts.garage ? 1 : Math.min(1, k * 1.6));
    cam.position.copy(this.pos);
    // tremor
    const sh = this.shake + (opts.menu || opts.garage ? 0 : Math.max(0, speed - 30) * 0.0012);
    if (sh > 0) {
      const t = this._t * 40;
      cam.position.x += (Math.sin(t * 1.3) + Math.sin(t * 2.7)) * sh * 0.05;
      cam.position.y += (Math.sin(t * 1.7) + Math.sin(t * 3.1)) * sh * 0.05;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    // inclinação (roll) acompanhando a curva
    const rollT = (opts.menu || opts.garage) ? 0 : (this.mode === 3 ? P.lean * 0.8 : P.lean * 0.18);
    this.roll += (rollT - this.roll) * Math.min(1, dt * 5);
    cam.up.set(0, 1, 0).applyAxisAngle(V().subVectors(this.look, cam.position).normalize(), -this.roll);
    cam.lookAt(this.look);
    this.fov += (fovT - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
