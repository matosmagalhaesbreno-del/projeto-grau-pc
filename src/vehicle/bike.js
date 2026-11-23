// Moto + piloto: modelo 3D, animação (direção, suspensão, rodas), luzes, placa e piloto com IK.
import * as THREE from 'three';
import { loadModel, cloneScene } from '../core/assets.js';
import { packNode, packedMaterial } from '../core/packer.js';
import { GLOBAL } from '../world/atmosphere.js';
const RIGID = new Set(['body', 'steer', 'fork_lower', 'wheel_front', 'swingarm', 'wheel_rear']);

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const tmpA = V3(), tmpB = V3(), tmpC = V3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();

// placa no padrão Mercosul (desenho próprio)
export function plateTexture(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 166;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f4f2'; x.fillRect(0, 0, 512, 166);
  x.fillStyle = '#103a9e'; x.fillRect(0, 0, 512, 40);
  x.fillStyle = '#fff'; x.font = 'bold 26px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('BRASIL', 256, 21);
  x.fillStyle = '#111'; x.font = 'bold 96px "Arial Narrow", Arial, sans-serif';
  x.fillText(text, 256, 106);
  x.strokeStyle = '#222'; x.lineWidth = 6; x.strokeRect(3, 3, 506, 160);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Bike {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.leanG = new THREE.Group();
    this.pitchG = new THREE.Group();
    this.root.add(this.leanG);
    this.leanG.add(this.pitchG);
    scene.add(this.root);
    this.headlight = new THREE.SpotLight(0xfff0dc, 0, 70, 0.48, 0.55, 1.4);
    this.headTarget = new THREE.Object3D();
    this.pitchG.add(this.headlight, this.headTarget);
    this.headlight.target = this.headTarget;
    this.wheelAngF = 0; this.wheelAngR = 0;
    this.ragdoll = null;
    this.night = 0;
  }

  async load(key, rider) {
    if (this.model) { this.pitchG.remove(this.model); }
    const gltf = await loadModel(key);
    const m = cloneScene(gltf);
    m.rotation.y = Math.PI;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.pitchG.add(m);
    this.model = m;
    const root = m.getObjectByName('bike');
    const ex = root.userData;
    this.geo = { wheelbase: ex.wheelbase, rRear: ex.r_rear, rFront: ex.r_front, style: ex.style, rake: ex.rake, seatH: ex.seat_h };
    this.n = {};
    for (const name of ['body', 'steer', 'fork_lower', 'wheel_front', 'swingarm', 'wheel_rear', 'grip_L', 'grip_R', 'peg_L', 'peg_R', 'seat', 'tail_tip']) this.n[name] = m.getObjectByName(name);
    this.forkRest = this.n.fork_lower.position.clone();
    const rk = THREE.MathUtils.degToRad(ex.rake);
    this.steerAxis = V3(0, Math.cos(rk), Math.sin(rk)).normalize();
    this.mats = {};
    m.traverse((o) => { if (o.isMesh) { const mm = Array.isArray(o.material) ? o.material : [o.material]; for (const x of mm) this.mats[x.name] = (this.mats[x.name] || []).concat([x]); } });
    for (const x of this.mats.windscreen || []) { x.transparent = true; x.depthWrite = false; }
    for (const x of this.mats.lens || []) { x.transparent = true; x.depthWrite = false; }
    this.geo.tailAngle = this.computeTailAngle();
    // empacota os materiais opacos de cada peça rígida numa única malha (poucas chamadas de desenho)
    this.pmat = packedMaterial({ globals: GLOBAL });
    for (const n of RIGID) packNode(this.n[n], this.pmat, RIGID);
    this.U = this.pmat.userData.U;
    const L = this.geo.wheelbase;
    this.headlight.position.set(0, 0.95, L + 0.15);
    this.headTarget.position.set(0, 0.0, L + 14);
    if (rider) await this.loadRider();
    return this.geo;
  }

  // menor ângulo de empinada em que alguma parte atrás do eixo encosta no chão
  computeTailAngle() {
    this.model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.pitchG.matrixWorld).invert();
    let best = Math.PI / 2;
    const v = V3();
    for (const name of ['body']) {
      this.n[name].traverse((o) => {
        if (!o.isMesh) return;
        const p = o.geometry.attributes.position;
        tmpM.multiplyMatrices(inv, o.matrixWorld);
        for (let i = 0; i < p.count; i += 2) {
          v.fromBufferAttribute(p, i).applyMatrix4(tmpM);
          const behind = -v.z;
          if (behind > 0.04 && v.y > 0.02) best = Math.min(best, Math.atan2(v.y, behind));
        }
      });
    }
    return Math.max(0.75, best - 0.01);
  }

  async loadRider() {
    if (this.riderG) this.pitchG.remove(this.riderG);
    const gltf = await loadModel('rider');
    const r = cloneScene(gltf);
    r.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.riderG = new THREE.Group();
    this.seg = {};
    for (const n of ['pelvis', 'torso', 'head', 'uarm_L', 'uarm_R', 'farm_L', 'farm_R', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R']) {
      const o = r.getObjectByName(n);
      o.position.set(0, 0, 0);
      o.quaternion.identity();
      this.riderG.add(o);
      this.seg[n] = o;
    }
    this.rmat = packedMaterial({ globals: GLOBAL });
    const segNames = new Set(Object.keys(this.seg));
    for (const n of segNames) packNode(this.seg[n], this.rmat, segNames);
    this.RU = this.rmat.userData.U;
    this.pitchG.add(this.riderG);
  }

  setPaint(main, rim) {
    if (main) { this.U.uPaint.value.set(main); this.U.uUsePaint.value = 1; } else this.U.uUsePaint.value = 0;
    if (rim) { this.U.uRim.value.set(rim); this.U.uUseRim.value = 1; } else this.U.uUseRim.value = 0;
  }

  setRiderColors(jacket, helmet) {
    if (!this.RU) return;
    this.RU.uJacket.value.set(jacket); this.RU.uUseJacket.value = 1;
    this.RU.uHelmet.value.set(helmet); this.RU.uUseHelmet.value = 1;
  }

  setPlate(text) {
    const t = plateTexture(text);
    for (const m of this.mats.plate || []) { m.map = t; m.color.set(0xffffff); m.needsUpdate = true; }
  }

  // ---------------------------------------------------------------------------
  update(dt, P, camMode) {
    const L = this.geo.wheelbase;
    if (P.crashed) { this.updateCrash(dt, P); return; }
    this.root.position.set(P.x, P.y, P.z);
    this.root.rotation.set(0, P.h, 0);
    const standLean = P.v < 0.35 ? -0.09 : 0;
    this.visLean = THREE.MathUtils.lerp(this.visLean || 0, P.lean + standLean, 1 - Math.exp(-dt * 10));
    this.leanG.rotation.z = this.visLean;
    // empinada (contato traseiro) ou stoppie (contato dianteiro)
    const th = P.pitch;
    if (th >= 0) { this.pitchG.position.set(0, 0, 0); this.pitchG.rotation.set(-th, 0, 0); }
    else {
      const a = -th; // gira em torno do contato dianteiro (0,0,L)
      this.pitchG.rotation.set(a, 0, 0);
      tmpA.set(0, 0, L).applyAxisAngle(V3(1, 0, 0), a);
      this.pitchG.position.set(0, -tmpA.y, L - tmpA.z);
    }
    // direção (no eixo do cáster) e suspensão
    tmpQ.setFromAxisAngle(this.steerAxis, -P.steer);
    this.n.steer.quaternion.copy(tmpQ);
    this.n.fork_lower.position.copy(this.forkRest).addScaledVector(this.steerAxis, P.susF);
    this.n.swingarm.rotation.x = -P.susR * 0.6;
    // rodas
    this.wheelAngF -= P.wF * dt;
    this.wheelAngR -= P.wR * dt;
    this.n.wheel_front.rotation.x = this.wheelAngF;
    this.n.wheel_rear.rotation.x = this.wheelAngR;
    // luzes
    const brake = Math.max(P.brakingF, P.brakingR);
    this.U.uTail.value = (1.2 + this.night * 1.5 + brake * 6) / 2;
    this.U.uHead.value = (2 + this.night * 10) / 3;
    this.U.uDrl.value = 1;
    this.headlight.intensity = this.night * 60;
    this.headlight.visible = this.night > 0.05;
    if (this.riderG) { this.riderG.visible = true; this.updateRider(dt, P, camMode); }
  }

  // ---------------------------------------------------------------------------
  // IK do piloto (em coordenadas locais do grupo de empinada: frente +Z, cima +Y, direita -X)
  updateRider(dt, P) {
    const g = this.geo, S = this.seg;
    const loc = (node, out) => { node.getWorldPosition(out); return this.pitchG.worldToLocal(out); };
    this.pitchG.updateMatrixWorld(true);
    const seat = loc(this.n.seat, V3());
    const gripL = loc(this.n.grip_L, V3()), gripR = loc(this.n.grip_R, V3());
    const pegL = loc(this.n.peg_L, V3()), pegR = loc(this.n.peg_R, V3());
    // inclinação do tronco: base por estilo + compensação do grau + peso do corpo
    const base = { sport: 0.72, naked: 0.32, commuter: 0.18, trail: 0.2, adventure: 0.16 }[g.style] || 0.3;
    const accelLean = THREE.MathUtils.clamp(P.a * 0.02, -0.15, 0.2);
    const alpha = base + P.pitch * 0.72 + P.bodyLean * 0.32 + accelLean + (P.tail ? -0.15 : 0);
    this.alpha = THREE.MathUtils.lerp(this.alpha || alpha, alpha, 1 - Math.exp(-dt * 9));
    const a = this.alpha;
    const hip = seat.clone().add(V3(0, 0.05, -0.04 - P.bodyLean * 0.06));
    hip.x += -this.visLean * 0.06; // corpo pende para dentro da curva
    const torsoDir = V3(0, Math.cos(a), Math.sin(a));
    const side = V3(1, 0, 0);
    // pélvis e tronco
    orient(S.pelvis, hip, hip.clone().add(V3(0, 1, 0.2).normalize()), V3(0, 0, 1));
    const lumbar = hip.clone().add(V3(0, 0.1, 0));
    orient(S.torso, lumbar, lumbar.clone().add(torsoDir), V3(0, -Math.sin(a), Math.cos(a)));
    const neck = lumbar.clone().addScaledVector(torsoDir, 0.47);
    // cabeça olhando para o horizonte
    const worldUp = V3(0, Math.cos(P.pitch), -Math.sin(P.pitch));
    const headUp = torsoDir.clone().multiplyScalar(0.35).addScaledVector(worldUp, 0.65).normalize();
    const look = V3(0, -Math.sin(-P.pitch) * 0, 1).applyAxisAngle(V3(1, 0, 0), -P.pitch).normalize();
    orient(S.head, neck, neck.clone().add(headUp), look);
    // braços
    for (const [sd, grip, U, F] of [[1, gripL, S.uarm_L, S.farm_L], [-1, gripR, S.uarm_R, S.farm_R]]) {
      const sh = lumbar.clone().addScaledVector(torsoDir, 0.40).addScaledVector(side, sd * 0.19);
      const pole = sh.clone().add(V3(sd * 0.45, -0.35, -0.35));
      const j = ik2(sh, grip, 0.29, 0.31, pole);
      orient(U, sh, j.joint, j.pdir.clone().negate());
      orient(F, j.joint, j.end, j.pdir.clone().negate());
    }
    // pernas (pé esquerdo no chão quando parado)
    const footDown = P.v < 0.35 && !P.crashed;
    this.footBlend = THREE.MathUtils.lerp(this.footBlend || 0, footDown ? 1 : 0, 1 - Math.exp(-dt * 6));
    for (const [sd, peg, T, Sh] of [[1, pegL, S.thigh_L, S.shin_L], [-1, pegR, S.thigh_R, S.shin_R]]) {
      const hj = hip.clone().add(V3(sd * 0.1, -0.03, 0));
      let tgt = peg.clone().add(V3(0, 0.07, -0.06));
      if (sd === 1 && this.footBlend > 0.01) {
        const ground = V3(0.42, 0.06, peg.z + 0.12);
        tgt.lerp(ground, this.footBlend);
      }
      const pole = hj.clone().add(V3(sd * 0.18, 0.1, 0.7));
      const j = ik2(hj, tgt, 0.44, 0.44, pole);
      orient(T, hj, j.joint, j.pdir);
      orient(Sh, j.joint, j.end, V3(0, 0, 1).lerp(j.pdir, 0.3).normalize());
    }
  }

  // ---------------------------------------------------------------------------
  startCrash(P) {
    const fwd = V3(Math.sin(P.h), 0, Math.cos(P.h));
    this.riderG.updateMatrixWorld(true);
    // destaca o piloto para o mundo
    const rg = this.riderG;
    const wp = V3(), wq = new THREE.Quaternion();
    rg.getWorldPosition(wp); rg.getWorldQuaternion(wq);
    this.pitchG.remove(rg);
    this.scene.add(rg);
    rg.position.copy(wp); rg.quaternion.copy(wq);
    const v = Math.max(P.v, 3);
    this.ragdoll = {
      vel: fwd.clone().multiplyScalar(v * 0.85).add(V3(0, 2.5 + v * 0.06, 0)),
      ang: V3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6 + (P.pitch > 0.5 ? -5 : 0)),
      t: 0,
    };
    this.crashSlide = { v: P.v, lean: this.visLean || 0, dir: this.visLean >= 0 ? 1 : -1, spin: (Math.random() - 0.5) * 1.5 };
  }

  updateCrash(dt, P) {
    if (!this.ragdoll) this.startCrash(P);
    const R = this.ragdoll, rg = this.riderG;
    R.t += dt;
    R.vel.y -= 9.81 * dt;
    rg.position.addScaledVector(R.vel, dt);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R.ang.x * dt, R.ang.y * dt, R.ang.z * dt));
    rg.quaternion.premultiply(q);
    const floor = P.y + 0.25;
    if (rg.position.y < floor) {
      rg.position.y = floor;
      if (R.vel.y < -1) { R.vel.y *= -0.3; this.onImpact && this.onImpact(); } else R.vel.y = 0;
      R.vel.x *= Math.pow(0.15, dt * 3); R.vel.z *= Math.pow(0.15, dt * 3);
      R.ang.multiplyScalar(Math.pow(0.1, dt * 2));
    }
    // membros balançando
    const s = this.seg, k = Math.sin(R.t * 14) * Math.max(0, 1 - R.t);
    s.uarm_L.rotation.z += k * 0.05; s.uarm_R.rotation.z -= k * 0.05; s.thigh_L.rotation.x += k * 0.04;
    // moto deslizando de lado
    const C = this.crashSlide;
    C.v = Math.max(0, C.v - 7 * dt);
    P.x += Math.sin(P.h) * C.v * dt; P.z += Math.cos(P.h) * C.v * dt;
    P.h += C.spin * dt * Math.min(1, C.v / 5);
    this.root.position.set(P.x, P.y, P.z);
    this.root.rotation.set(0, P.h, 0);
    this.leanG.rotation.z = THREE.MathUtils.lerp(this.leanG.rotation.z, C.dir * 1.42, 1 - Math.exp(-dt * 6));
    this.pitchG.rotation.x = THREE.MathUtils.lerp(this.pitchG.rotation.x, 0, 1 - Math.exp(-dt * 5));
    this.pitchG.position.lerp(V3(), 1 - Math.exp(-dt * 5));
    this.slideSpeed = C.v;
  }

  endCrash() {
    if (!this.ragdoll) return;
    this.scene.remove(this.riderG);
    this.pitchG.add(this.riderG);
    this.riderG.position.set(0, 0, 0);
    this.riderG.quaternion.identity();
    this.ragdoll = null;
    this.crashSlide = null;
  }

  worldPoint(local, out = V3()) { return this.pitchG.localToWorld(out.copy(local)); }
}

// IK de dois ossos
function ik2(A, T, l1, l2, pole) {
  const d0 = tmpA.subVectors(T, A);
  let d = d0.length();
  const dir = d0.clone().divideScalar(d || 1);
  d = Math.min(d, (l1 + l2) * 0.999);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pv = tmpB.subVectors(pole, A);
  const pdir = pv.sub(dir.clone().multiplyScalar(pv.dot(dir))).normalize();
  const joint = A.clone().addScaledVector(dir, a).addScaledVector(pdir, h);
  const end = A.clone().addScaledVector(dir, d);
  return { joint, end, pdir: pdir.clone() };
}

// orienta um segmento: eixo +Y de A para B, frente (+Z) próxima de `front`
function orient(obj, A, B, front) {
  const y = tmpA.subVectors(B, A).normalize();
  const z = tmpB.copy(front).addScaledVector(y, -front.dot(y));
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z);
  z.normalize();
  const x = tmpC.crossVectors(y, z).normalize();
  tmpM.makeBasis(x, y, z);
  obj.quaternion.setFromRotationMatrix(tmpM);
  obj.position.copy(A);
}
