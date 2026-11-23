// Trânsito: carros com IA seguindo a malha viária, semáforos, distância de segurança,
// reação ao jogador, luzes de freio por instância e carros estacionados.
import * as THREE from 'three';
import { AVX, XS, ZS, SW, CURB } from './city.js';
import { packGeometry, packedMaterial } from '../core/packer.js';
import { GLOBAL } from './atmosphere.js';

const TYPES = ['car_hatch', 'car_sedan', 'car_suv', 'car_pickup'];
const COLORS = [0xf2f2f2, 0x111214, 0x8b8f96, 0xb5b8bd, 0x7a0d12, 0x1b3f8f, 0x23452f, 0xd9b12b, 0x5a2a12, 0xc9c9c4, 0x2c2c30, 0x9a1b1b];
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1), YAX = new THREE.Vector3(0, 1, 0), XAX = new THREE.Vector3(1, 0, 0);
const W_POS = new THREE.Vector3(), W_Q = new THREE.Quaternion(), W_SPIN = new THREE.Quaternion(), W_M = new THREE.Matrix4();
const COL = new THREE.Color();

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Traffic {
  constructor(scene, city, models, count = 80) {
    this.scene = scene;
    this.city = city;
    this.net = city.net;
    this.cars = [];
    this.parked = [];
    this.rand = rng(4242);
    this.phase = 0; // tempo do ciclo semafórico
    this.root = new THREE.Group();
    scene.add(this.root);
    this.lightMatF = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.types = TYPES.map((t) => this.prepareType(models[t]));
    const rand = this.rand;
    // estacionados
    for (const x of XS) {
      for (let z = ZS[0] + 14; z < ZS[ZS.length - 1] - 10; z += 6.5) {
        if (ZS.some((zz) => Math.abs(z - zz) < SW / 2 + 9)) continue;
        if (rand() < 0.22) this.parked.push({ x: x - 4.9, z, h: 0, type: (rand() * 4) | 0, color: COLORS[(rand() * COLORS.length) | 0] });
        if (rand() < 0.22) this.parked.push({ x: x + 4.9, z, h: Math.PI, type: (rand() * 4) | 0, color: COLORS[(rand() * COLORS.length) | 0] });
      }
    }
    for (const p of this.parked) {
      const T = this.types[p.type];
      const hw = T.W / 2 + 0.1, hl = T.L / 2;
      city.addBox(p.x - hw, p.x + hw, p.z - hl, p.z + hl, 'car');
    }
    this.maxMoving = count;
    for (let i = 0; i < count; i++) this.spawnCar();
    this.buildInstances();
  }

  prepareType(gltf) {
    const ex = gltf.scene.getObjectByName('car').userData;
    gltf.scene.updateMatrixWorld(true);
    const parts = [];
    let wheel = null;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const isWheel = o.name.startsWith('wheel') || (o.parent && o.parent.name === 'wheel');
      if (isWheel) { wheel = wheel || []; wheel.push({ geometry: o.geometry.clone(), material: o.material }); return; }
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      g.rotateY(Math.PI); // frente para +Z
      parts.push({ geometry: g, material: o.material });
    });
    const body = packGeometry(parts);
    const wheelGeo = packGeometry(wheel);
    return { body, wheelGeo, wb: ex.wb, track: ex.track, wr: ex.wr, L: ex.L, W: ex.W };
  }

  spawnCar(avoid) {
    const rand = this.rand, edges = this.net.edges;
    for (let tries = 0; tries < 30; tries++) {
      const e = edges[(rand() * edges.length) | 0];
      const lane = (rand() * e.lanes) | 0;
      const A = this.net.nodes[e.a], B = this.net.nodes[e.b];
      const s0 = A.hw + 4, s1 = e.len - B.hw - 4;
      const s = s0 + rand() * (s1 - s0);
      if (e.cars.some((c) => c.lane === lane && Math.abs(c.s - s) < 12)) continue;
      const pos = this.lanePos(e, lane, s);
      if (avoid && Math.hypot(pos.x - avoid.x, pos.z - avoid.z) < 60) continue;
      const type = (rand() * 4) | 0;
      const vMax = (AVX === A.x && AVX === B.x ? 15 : 11) * (0.85 + rand() * 0.3);
      const car = { e, lane, s, v: vMax * 0.6, vMax, type, color: COLORS[(rand() * COLORS.length) | 0], turn: null, x: pos.x, z: pos.z, h: Math.atan2(e.dx, e.dz), braking: 0, honk: 0, wheel: 0 };
      e.cars.push(car);
      this.cars.push(car);
      return car;
    }
    return null;
  }

  lanePos(e, lane, s) {
    const A = this.net.nodes[e.a];
    const off = e.offs[lane];
    return { x: A.x + e.dx * s - e.dz * off, z: A.z + e.dz * s + e.dx * off };
  }

  buildInstances() {
    this.carMat = packedMaterial({ globals: GLOBAL, instanced: true });
    this.wheelMat = packedMaterial({ globals: GLOBAL });
    this.CU = this.carMat.userData.U;
    this.inst = this.types.map((T, ti) => {
      const n = Math.max(1, this.cars.filter((c) => c.type === ti).length + this.parked.filter((p) => p.type === ti).length);
      const mk = (shadow) => {
        const g = T.body.clone();
        const paint = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
        const brake = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('aPaintI', paint);
        g.setAttribute('aBrakeI', brake);
        const body = new THREE.InstancedMesh(g, this.carMat, n);
        body.castShadow = shadow; body.receiveShadow = true; body.frustumCulled = false; body.count = 0;
        const wheels = new THREE.InstancedMesh(T.wheelGeo, this.wheelMat, n * 4);
        wheels.castShadow = shadow; wheels.frustumCulled = false; wheels.count = 0;
        this.root.add(body, wheels);
        return { body, wheels, paint, brake };
      };
      return { near: mk(true), far: mk(false), n };
    });
  }

  writeInstance(o, set, slot) {
    const T = this.types[o.type];
    const x = o.x, z = o.z, h = o.h, wheelAng = o.wheel || 0;
    tmpQ.setFromAxisAngle(YAX, h);
    tmpM.compose(tmpV.set(x, 0, z), tmpQ, tmpS);
    set.body.setMatrixAt(slot, tmpM);
    COL.set(o.color);
    set.paint.setXYZ(slot, COL.r, COL.g, COL.b);
    set.brake.setX(slot, o.braking ? 1 : 0);
    // rodas (aro sempre para fora)
    const fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
    for (let w = 0; w < 4; w++) {
      const a = w < 2 ? T.wb / 2 : -T.wb / 2, sd = w % 2 ? -1 : 1;
      W_POS.set(x + fx * a + rx * sd * T.track / 2, T.wr, z + fz * a + rz * sd * T.track / 2);
      W_Q.setFromAxisAngle(YAX, h + (sd < 0 ? Math.PI : 0));
      W_SPIN.setFromAxisAngle(XAX, sd < 0 ? -wheelAng : wheelAng);
      W_Q.multiply(W_SPIN);
      W_M.compose(W_POS, W_Q, tmpS);
      set.wheels.setMatrixAt(slot * 4 + w, W_M);
    }
  }

  // escreve só os carros visíveis (perto projeta sombra, longe não)
  pack(cam, quality, night) {
    const near = quality.shadowDist * 1.1, far = quality.drawDist * 0.45;
    const n2 = near * near, f2 = far * far;
    const cnt = this.inst.map(() => [0, 0]);
    const all = this.cars.concat(this.parked);
    for (const o of all) {
      const dx = o.x - cam.x, dz = o.z - cam.z, d2 = dx * dx + dz * dz;
      if (d2 > f2) continue;
      const I = this.inst[o.type], isNear = d2 < n2 ? 0 : 1;
      this.writeInstance(o, isNear === 0 ? I.near : I.far, cnt[o.type][isNear]++);
    }
    this.inst.forEach((I, ti) => {
      for (const [set, c] of [[I.near, cnt[ti][0]], [I.far, cnt[ti][1]]]) {
        set.body.count = c; set.body.instanceMatrix.needsUpdate = true;
        set.paint.needsUpdate = true; set.brake.needsUpdate = true;
        set.wheels.count = c * 4; set.wheels.instanceMatrix.needsUpdate = true;
      }
    });
  }

  lightPhase() {
    // ciclo de 30 s: avenida verde 16 s, amarelo 3 s, vermelho 11 s
    const t = this.phase % 30;
    const av = t < 16 ? 'green' : t < 19 ? 'yellow' : 'red';
    const st = t < 19 ? 'red' : t < 28 ? 'green' : 'yellow';
    return { av, st };
  }

  // atualiza a IA; retorna eventos de interação com o jogador
  update(dt, player, night, cam, quality) {
    this.phase += dt;
    const ph = this.lightPhase();
    const events = [];
    const nodes = this.net.nodes;
    const px = player.x, pz = player.z, pfx = Math.sin(player.h), pfz = Math.cos(player.h);
    for (const c of this.cars) {
      const e = c.e, B = nodes[e.b], A = nodes[e.a];
      let target = c.vMax;
      if (!c.turn) {
        const end = e.len - B.hw - 3.5;
        // carro à frente na mesma faixa
        let gap = Infinity;
        for (const o of e.cars) if (o !== c && o.lane === c.lane && !o.turn && o.s > c.s) gap = Math.min(gap, o.s - c.s - 6);
        if (gap < Infinity) target = Math.min(target, Math.max(0, gap * 0.7));
        // semáforo / cruzamento
        const toEnd = end - c.s;
        let stop = false;
        if (B.light) {
          const grp = e.axis === 'z' ? ph.av : ph.st;
          if (grp === 'red' || (grp === 'yellow' && toEnd > 6)) stop = true;
        }
        if (B.busy > 0 && toEnd < 6) stop = true;
        if (stop) target = Math.min(target, Math.max(0, (toEnd - 0.5) * 0.6));
        // jogador à frente
        const dx = px - c.x, dz = pz - c.z;
        const along = dx * e.dx + dz * e.dz, lat = -dx * e.dz + dz * e.dx - e.offs[c.lane];
        if (along > 0 && along < 16 && Math.abs(lat) < 2.4 && !player.crashed) {
          target = Math.min(target, Math.max(0, (along - 6) * 0.6));
          if (along < 9 && c.honk <= 0) { c.honk = 4; events.push({ type: 'honk', car: c }); }
        }
        c.honk -= dt;
        const acc = target > c.v ? 2.2 : 6.5;
        c.v += Math.max(-acc * dt, Math.min(acc * dt, target - c.v));
        c.braking = target < c.v - 0.5 || c.v < 0.3 ? 1 : 0;
        c.s += c.v * dt;
        if (c.s >= end && !stop) this.beginTurn(c);
        if (!c.turn) {
          const p = this.lanePos(e, c.lane, Math.min(c.s, end));
          c.x = p.x; c.z = p.z; c.h = Math.atan2(e.dx, e.dz);
        }
      } else {
        const T = c.turn;
        c.v += Math.min(2 * dt, Math.max(-6 * dt, c.vMax * 0.6 - c.v));
        T.t += (c.v * dt) / T.len;
        const t = Math.min(T.t, 1), u = 1 - t;
        c.x = u * u * T.p0.x + 2 * u * t * T.p1.x + t * t * T.p2.x;
        c.z = u * u * T.p0.z + 2 * u * t * T.p1.z + t * t * T.p2.z;
        const dx = 2 * u * (T.p1.x - T.p0.x) + 2 * t * (T.p2.x - T.p1.x), dz = 2 * u * (T.p1.z - T.p0.z) + 2 * t * (T.p2.z - T.p1.z);
        c.h = Math.atan2(dx, dz);
        if (T.t >= 1) {
          nodes[T.node].busy--;
          const ne = T.next;
          c.e.cars.splice(c.e.cars.indexOf(c), 1);
          c.e = ne; c.lane = T.lane; c.s = nodes[ne.a].hw + 3.5; c.turn = null;
          ne.cars.push(c);
        }
      }
      c.wheel += c.v * dt / 0.31;
      // colisão / corte com o jogador
      const dx = px - c.x, dz = pz - c.z;
      if (Math.abs(dx) < 8 && Math.abs(dz) < 8) {
        const fx = Math.sin(c.h), fz = Math.cos(c.h);
        const along = dx * fx + dz * fz, lat = -dx * fz + dz * fx;
        const T = this.types[c.type];
        if (Math.abs(along) < T.L / 2 + 0.35 && Math.abs(lat) < T.W / 2 + 0.35) events.push({ type: 'hit', car: c, rel: Math.abs((player.v * (pfx * fx + pfz * fz)) - c.v) });
        else if (Math.abs(along) < T.L / 2 + 1.0 && Math.abs(lat) < T.W / 2 + 1.6) events.push({ type: 'near', car: c });
      }
    }
    // respawn de carros muito longe (mantém densidade perto do jogador)
    for (const c of this.cars) {
      if (Math.abs(c.x - px) > 520 || Math.abs(c.z - pz) > 520) {
        if (c.turn) { nodes[c.turn.node].busy--; c.turn = null; }
        c.e.cars.splice(c.e.cars.indexOf(c), 1);
        const nc = this.relocate(c, player);
        void nc;
      }
    }
    // instâncias
    this.pack(cam, quality, night);
    this.CU.uHead.value = 0.3 + night * 12;
    this.CU.uTail.value = 0.6 + night * 2.5;
    return { events, phase: ph };
  }

  relocate(c, player) {
    const rand = this.rand, edges = this.net.edges;
    for (let tries = 0; tries < 40; tries++) {
      const e = edges[(rand() * edges.length) | 0];
      const A = this.net.nodes[e.a], B = this.net.nodes[e.b];
      const lane = (rand() * e.lanes) | 0;
      const s = A.hw + 4 + rand() * (e.len - A.hw - B.hw - 8);
      const p = this.lanePos(e, lane, s);
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < 90 || d > 420) continue;
      if (e.cars.some((o) => o.lane === lane && Math.abs(o.s - s) < 12)) continue;
      Object.assign(c, { e, lane, s, x: p.x, z: p.z, turn: null, v: c.vMax * 0.6 });
      e.cars.push(c);
      return true;
    }
    c.e.cars.push(c);
    return false;
  }

  beginTurn(c) {
    const e = c.e, nodes = this.net.nodes, B = nodes[e.b];
    const opts = B.out.filter((o) => o.b !== e.a);
    if (!opts.length) return;
    // prefere seguir reto
    let next = opts.find((o) => Math.abs(o.dx - e.dx) < 0.01 && Math.abs(o.dz - e.dz) < 0.01);
    if (!next || this.rand() < 0.35) next = opts[(this.rand() * opts.length) | 0];
    if (B.busy > 1) return;
    const lane = Math.min(next.lanes - 1, (this.rand() * next.lanes) | 0);
    const p0 = this.lanePos(e, c.lane, e.len - B.hw - 3.5);
    const p2 = this.lanePos(next, lane, nodes[next.a].hw + 3.5);
    // ponto de controle: interseção das linhas das faixas
    const d1 = { x: e.dx, z: e.dz }, d2 = { x: next.dx, z: next.dz };
    const cross = d1.x * d2.z - d1.z * d2.x;
    let p1;
    if (Math.abs(cross) < 1e-3) p1 = { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
    else {
      const t = ((p2.x - p0.x) * d2.z - (p2.z - p0.z) * d2.x) / cross;
      p1 = { x: p0.x + d1.x * t, z: p0.z + d1.z * t };
    }
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z) + Math.hypot(p2.x - p1.x, p2.z - p1.z);
    B.busy = (B.busy || 0) + 1;
    c.turn = { p0, p1, p2, t: 0, len: Math.max(len, 1), next, lane, node: B.id };
  }
}
export { CURB };
