// Objetos instanciados da cidade: palmeiras, postes (com halo de luz à noite), semáforos,
// árvores, bancos, lixeiras, quiosques e guarda-sóis.
import * as THREE from 'three';
import { bakeParts } from '../core/assets.js';
import { XS, AVX, ZS, SW, AVW, SIDE, CURB, BEACH_X0, SAND_X0, Z_MIN, Z_MAX, sandHeight, mergeGeos } from './city.js';
import { GLOBAL } from './atmosphere.js';

const XL = [...XS, AVX];
const hwX = (x) => (x === AVX ? AVW / 2 : SW / 2);
const nearCross = (x, z, m = 4) => XL.some((xx) => Math.abs(x - xx) < hwX(xx) + m) && ZS.some((zz) => Math.abs(z - zz) < SW / 2 + m);
const nearZ = (z, m) => ZS.some((zz) => Math.abs(z - zz) < SW / 2 + m);
const nearX = (x, m) => XL.some((xx) => Math.abs(x - xx) < hwX(xx) + m);

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Instanciador por distância: só desenha o que está perto da câmera; a faixa próxima projeta
// sombra e a distante não (economiza a passada de sombras). Reempacota algumas vezes por segundo.
export class DistanceInstancer {
  constructor(parts, matrices, opts = {}) {
    this.matrices = matrices;
    this.colors = opts.colors || null;
    this.group = new THREE.Group();
    this.pos = matrices.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
    const mk = (shadow) => parts.map((p) => {
      const mat = opts.material ? opts.material(p) : p.material;
      const im = new THREE.InstancedMesh(p.geometry, mat, Math.max(1, matrices.length));
      im.count = 0;
      im.castShadow = shadow && opts.castShadow !== false;
      im.receiveShadow = true;
      im.frustumCulled = false;
      if (this.colors) im.setColorAt(0, new THREE.Color(1, 1, 1));
      this.group.add(im);
      return im;
    });
    this.near = mk(true);
    this.far = mk(false);
    this.meshes = [...this.near, ...this.far];
    this.nearIdx = []; this.farIdx = [];
  }
  update(cam, nearR, farR) {
    const n2 = nearR * nearR, f2 = farR * farR;
    const ni = this.nearIdx, fi = this.farIdx;
    ni.length = 0; fi.length = 0;
    for (let i = 0; i < this.pos.length; i++) {
      const p = this.pos[i];
      const dx = p.x - cam.x, dz = p.z - cam.z, d2 = dx * dx + dz * dz;
      if (d2 < n2) ni.push(i); else if (d2 < f2) fi.push(i);
    }
    this.write(this.near, ni);
    this.write(this.far, fi);
  }
  write(meshes, idx) {
    for (const im of meshes) {
      for (let k = 0; k < idx.length; k++) {
        im.setMatrixAt(k, this.matrices[idx[k]]);
        if (this.colors) im.setColorAt(k, this.colors[idx[k]]);
      }
      im.count = idx.length;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  setColor(i, c) { this.colors[i] = c; }
}

function instanced(parts, matrices, opts = {}) {
  const di = new DistanceInstancer(parts, matrices, opts);
  INSTANCERS.push(di);
  return di;
}
const INSTANCERS = [];

const M = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));

export class Props {
  constructor(scene, city, models, quality) {
    this.scene = scene;
    this.city = city;
    this.root = new THREE.Group();
    scene.add(this.root);
    const rand = rng(77);
    const det = quality.detail;

    // ---------------- palmeiras ----------------
    const palms = [];
    for (let z = Z_MIN + 8; z < Z_MAX; z += 17) if (!nearZ(z, 3)) palms.push([AVX, CURB, z]);
    for (let z = Z_MIN; z < Z_MAX; z += 21) palms.push([SAND_X0 + 2.5 + rand() * 2, sandHeight(SAND_X0 + 3), z + rand() * 6]);
    for (let k = 0; k < 120 * det; k++) { const x = SAND_X0 + 8 + rand() * 18, z = Z_MIN + rand() * (Z_MAX - Z_MIN); palms.push([x, sandHeight(x), z]); }
    for (const b of city.blocks) {
      if (b.zone === 'plaza') {
        for (let x = b.x0 + 4; x < b.x1 - 2; x += 10) { palms.push([x, CURB, b.z0 + 3]); palms.push([x, CURB, b.z1 - 3]); }
        for (let z = b.z0 + 13; z < b.z1 - 10; z += 10) palms.push([b.x0 + 3, CURB, z]);
      }
    }
    const pm = palms.map(([x, y, z]) => { city.addCircle(x, z, 0.35, 'palm'); return M(x, y, z, rand() * Math.PI * 2, 0.85 + rand() * 0.35); });
    const palmParts = bakeParts(models.palm);
    for (const p of palmParts) {
      if (p.material.name === 'frond') { p.material.side = THREE.DoubleSide; this.frondMat = p.material; addSway(p.material); }
    }
    this.root.add(instanced(palmParts, pm).group);

    // ---------------- postes ----------------
    const lamps = [];
    const lampAt = (x, z, dx, dz) => { lamps.push({ x, z, dx, dz }); city.addCircle(x, z, 0.18, 'pole'); };
    for (const x of XL) {
      const hw = hwX(x);
      for (let z = Z_MIN + 10; z < Z_MAX; z += 44) {
        if (nearZ(z, 5)) continue;
        if (x === AVX) { lampAt(x - 1.0, z, -1, 0); lampAt(x + 1.0, z + 22, 1, 0); continue; }
        lampAt(x - hw - 0.6, z, 1, 0);
        lampAt(x + hw + 0.6, z + 22, -1, 0);
      }
    }
    for (const z of ZS) {
      for (let x = XS[0] + 12; x < AVX - 10; x += 44) {
        if (nearX(x, 5)) continue;
        lampAt(x, z - SW / 2 - 0.6, 0, 1);
        lampAt(x + 22, z + SW / 2 + 0.6, 0, -1);
      }
    }
    for (let z = Z_MIN; z < Z_MAX; z += 30) lampAt(BEACH_X0 + 0.8, z, -1, 0);
    this.lamps = lamps;
    const lm = lamps.map((l) => M(l.x, 0, l.z, Math.atan2(-l.dx, -l.dz)));
    const lampParts = bakeParts(models.lamp);
    for (const p of lampParts) if (p.material.name === 'lamp') { this.lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6 }); p.material = this.lampMat; }
    this.root.add(instanced(lampParts, lm).group);

    // halos de luz no chão (aditivos, só à noite)
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,214,160,1)'); gr.addColorStop(0.35, 'rgba(255,190,120,0.45)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
    const poolTex = new THREE.CanvasTexture(cv);
    poolTex.colorSpace = THREE.SRGBColorSpace;
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: true, color: 0xffffff });
    const poolGeo = new THREE.PlaneGeometry(16, 16); poolGeo.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(poolGeo, this.poolMat, lamps.length);
    this.poolMats = lamps.map((l) => {
      const x = l.x + l.dx * 1.85, z = l.z + l.dz * 1.85;
      const s = city.surfaceAt(x, z);
      return M(x, s.h + 0.03, z);
    });
    pools.count = 0;
    pools.renderOrder = 2;
    pools.frustumCulled = false;
    this.pools = pools;
    this.root.add(pools);

    // ---------------- semáforos (avenida) ----------------
    const tl = [];
    for (const z of ZS) {
      tl.push({ x: AVX - AVW / 2 - 1.2, z: z - SW / 2 - 2.5, ry: -Math.PI / 2, group: 'av' });  // sentido +z
      tl.push({ x: AVX + AVW / 2 + 1.2, z: z + SW / 2 + 2.5, ry: Math.PI / 2, group: 'av' });   // sentido -z
      tl.push({ x: AVX - AVW / 2 - 2.5, z: z + SW / 2 + 1.2, ry: Math.PI, group: 'st' });         // rua -> avenida
    }
    for (const t of tl) city.addCircle(t.x, t.z, 0.15, 'pole');
    this.tlights = tl;
    const tlBody = bakeParts(models.tlight, (o) => !o.name.startsWith('lamp_'));
    const tmats = tl.map((t) => M(t.x, CURB, t.z, t.ry));
    this.root.add(instanced(tlBody, tmats).group);
    this.tlLamps = {};
    for (const color of ['red', 'yellow', 'green']) {
      const parts = bakeParts(models.tlight, (o) => o.name === 'lamp_' + color || (o.parent && o.parent.name === 'lamp_' + color));
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const im = instanced(parts, tmats, { material: () => mat, castShadow: false, colors: tl.map(() => new THREE.Color(0.05, 0.05, 0.05)) });
      this.tlLamps[color] = im;
      this.root.add(im.group);
    }

    // ---------------- árvores comuns ----------------
    const treeGeo = makeTreeGeometry();
    const trees = [];
    for (const b of city.blocks) {
      if (b.zone === 'beach' || b.zone === 'plaza') continue;
      const step = b.zone === 'park' ? 9 : 16;
      const edge = (x0, z0, x1, z1) => {
        const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / step);
        for (let k = 1; k < n; k++) {
          if (rand() > det) continue;
          const t = k / n;
          trees.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
        }
      };
      const ins = 1.3;
      if (b.zone === 'park') {
        for (let k = 0; k < 40 * det; k++) trees.push([b.x0 + 8 + rand() * (b.x1 - b.x0 - 16), b.z0 + 8 + rand() * (b.z1 - b.z0 - 16)]);
      }
      edge(b.x0 + ins, b.z0 + ins, b.x1 - ins, b.z0 + ins);
      edge(b.x0 + ins, b.z1 - ins, b.x1 - ins, b.z1 - ins);
      edge(b.x0 + ins, b.z0 + ins, b.x0 + ins, b.z1 - ins);
      edge(b.x1 - ins, b.z0 + ins, b.x1 - ins, b.z1 - ins);
    }
    const filtered = trees.filter(([x, z]) => !lamps.some((l) => Math.abs(l.x - x) < 3 && Math.abs(l.z - z) < 3));
    const tm = filtered.map(([x, z]) => { city.addCircle(x, z, 0.3, 'tree'); return M(x, CURB, z, rand() * 6.28, 0.8 + rand() * 0.5); });
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    addSway(treeMat, 0.05);
    this.root.add(instanced([{ geometry: treeGeo, material: treeMat }], tm).group);

    // ---------------- mobiliário do calçadão ----------------
    const benchGeo = makeBenchGeometry();
    const bm = [];
    for (let z = Z_MIN + 15; z < Z_MAX; z += 30) { bm.push(M(SAND_X0 - 1.2, CURB, z, -Math.PI / 2)); city.addBox(SAND_X0 - 1.6, SAND_X0 - 0.8, z - 1, z + 1, 'bench'); }
    const plaza = city.blocks.find((b) => b.zone === 'plaza');
    for (let x = plaza.x0 + 10; x < plaza.x1 - 6; x += 14) { bm.push(M(x, CURB, plaza.z1 - 6, Math.PI)); city.addBox(x - 1, x + 1, plaza.z1 - 6.4, plaza.z1 - 5.6, 'bench'); }
    this.root.add(instanced([{ geometry: benchGeo, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 }) }], bm).group);

    // quiosques na areia
    const kioskGeo = makeKioskGeometry();
    const km = [];
    for (let z = Z_MIN + 40; z < Z_MAX; z += 130) { const x = SAND_X0 + 7; km.push(M(x, sandHeight(x), z)); city.addCircle(x, z, 2.6, 'kiosk'); }
    this.root.add(instanced([{ geometry: kioskGeo, material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }) }], km).group);

    // guarda-sóis coloridos perto do mar
    const umbGeo = makeUmbrellaGeometry();
    const um = [];
    const ucol = [];
    const palette = [0xe63946, 0xf1c453, 0x2a9d8f, 0x457b9d, 0xf4a261, 0xffffff, 0x8e44ad];
    for (let k = 0; k < 220 * det; k++) {
      const x = SAND_X0 + 14 + rand() * 16, z = Z_MIN + rand() * (Z_MAX - Z_MIN);
      um.push(M(x, sandHeight(x), z, rand() * 6.28, 0.9 + rand() * 0.2));
      ucol.push(new THREE.Color(palette[(rand() * palette.length) | 0]));
    }
    const umb = instanced([{ geometry: umbGeo, material: new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }) }], um, { colors: ucol });
    this.root.add(umb.group);
  }

  updatePools(cam, R) {
    let k = 0;
    const r2 = R * R, v = new THREE.Vector3();
    for (const m of this.poolMats) {
      v.setFromMatrixPosition(m);
      if ((v.x - cam.x) ** 2 + (v.z - cam.z) ** 2 < r2) this.pools.setMatrixAt(k++, m);
    }
    this.pools.count = k;
    this.pools.instanceMatrix.needsUpdate = true;
  }

  // estado dos semáforos: fase da avenida ('green'|'yellow'|'red')
  setLights(avPhase, stPhase) {
    const on = { red: new THREE.Color(4, 0.15, 0.1), yellow: new THREE.Color(4, 2.2, 0.1), green: new THREE.Color(0.2, 4, 1.6) };
    const off = new THREE.Color(0.04, 0.04, 0.04);
    for (const color of ['red', 'yellow', 'green']) {
      const di = this.tlLamps[color];
      this.tlights.forEach((t, i) => di.colors[i].copy((t.group === 'av' ? avPhase : stPhase) === color ? on[color] : off));
      di.dirty = true;
    }
    this.cullTimer = 0;
  }

  update(dt, night, cam, quality) {
    this.cullTimer = (this.cullTimer || 0) - dt;
    if (this.cullTimer <= 0) {
      this.cullTimer = 0.2;
      const far = quality.drawDist * 0.5, near = quality.shadowDist * 1.3;
      for (const di of INSTANCERS) di.update(cam, near, far);
      this.updatePools(cam, far * 0.8);
    }
    this.poolMat.opacity = night * 0.55;
    this.pools.visible = night > 0.02;
    if (this.lampMat) this.lampMat.color.setScalar(0.6 + night * 5.5);
  }
}

// balanço com o vento (vértices mais altos se movem mais)
function addSway(mat, amp = 0.12) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = GLOBAL.uTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float hgt = max(transformed.y - 3.0, 0.0);
          float ph = dot(ip.xz, vec2(0.13, 0.07));
          transformed.x += sin(uTime * 1.3 + ph) * ${amp.toFixed(3)} * hgt * 0.25;
          transformed.z += cos(uTime * 1.1 + ph * 1.3) * ${amp.toFixed(3)} * hgt * 0.2;
        }`);
    // neblina global
    shader.uniforms.uFogSunDir = GLOBAL.uFogSunDir; shader.uniforms.uFogSunColor = GLOBAL.uFogSunColor; shader.uniforms.uFogHeight = GLOBAL.uFogHeight;
  };
  mat.customProgramCacheKey = () => 'sway' + amp;
}

function colored(geo, c) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}

function mergeColored(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

function makeTreeGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 3.2, 7); trunk.translate(0, 1.6, 0);
  parts.push(colored(trunk, new THREE.Color(0.22, 0.16, 0.1)));
  const blobs = [[0, 4.2, 0, 1.8], [0.9, 3.7, 0.4, 1.3], [-0.8, 3.8, -0.5, 1.4], [0.2, 5.0, -0.3, 1.2]];
  for (const [x, y, z, r] of blobs) {
    const b = new THREE.IcosahedronGeometry(r, 1);
    const p = b.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + (Math.sin(p.getX(i) * 5 + p.getY(i) * 3) * 0.12); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k); }
    b.computeVertexNormals();
    b.translate(x, y, z);
    parts.push(colored(b, new THREE.Color(0.06 + Math.random() * 0.03, 0.14 + Math.random() * 0.05, 0.04)));
  }
  return mergeColored(parts);
}

function makeBenchGeometry() {
  const wood = new THREE.Color(0.35, 0.22, 0.12), metal = new THREE.Color(0.1, 0.1, 0.11);
  const parts = [];
  for (let k = 0; k < 3; k++) { const s = new THREE.BoxGeometry(1.9, 0.05, 0.12); s.translate(0, 0.45, -0.15 + k * 0.15); parts.push(colored(s, wood)); }
  for (let k = 0; k < 2; k++) { const s = new THREE.BoxGeometry(1.9, 0.12, 0.04); s.translate(0, 0.65 + k * 0.16, -0.25); parts.push(colored(s, wood)); }
  for (const x of [-0.8, 0.8]) { const l = new THREE.BoxGeometry(0.06, 0.45, 0.45); l.translate(x, 0.22, -0.05); parts.push(colored(l, metal)); }
  return mergeColored(parts);
}

function makeKioskGeometry() {
  const parts = [];
  const body = new THREE.CylinderGeometry(2.0, 2.0, 2.6, 6); body.translate(0, 1.3, 0);
  parts.push(colored(body, new THREE.Color(0.85, 0.85, 0.82)));
  const counter = new THREE.CylinderGeometry(2.35, 2.35, 0.12, 6); counter.translate(0, 1.1, 0);
  parts.push(colored(counter, new THREE.Color(0.25, 0.15, 0.08)));
  const roof = new THREE.ConeGeometry(3.4, 1.2, 6); roof.translate(0, 3.2, 0);
  parts.push(colored(roof, new THREE.Color(0.55, 0.12, 0.1)));
  const pole = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6); pole.translate(0, 4.4, 0);
  parts.push(colored(pole, new THREE.Color(0.2, 0.2, 0.2)));
  for (let k = 0; k < 4; k++) { const st = new THREE.CylinderGeometry(0.22, 0.18, 0.7, 8); st.translate(Math.cos(k * 1.6) * 3.2, 0.35, Math.sin(k * 1.6) * 3.2); parts.push(colored(st, new THREE.Color(0.9, 0.9, 0.9))); }
  return mergeColored(parts);
}

function makeUmbrellaGeometry() {
  const parts = [];
  const pole = new THREE.CylinderGeometry(0.025, 0.025, 2.2, 5); pole.translate(0, 1.1, 0);
  parts.push(pole);
  const top = new THREE.ConeGeometry(1.2, 0.45, 10, 1, true); top.translate(0, 2.2, 0);
  parts.push(top);
  const geos = parts.map((g) => g.toNonIndexed());
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

export { mergeGeos };
