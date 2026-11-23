// Cidade litorânea procedural: avenida beira-mar, calçadão, praia, mar, praça de grau,
// malha urbana com prédios por bairro, colisões e malha viária para o trânsito.
import * as THREE from 'three';
import { createFacadeMaterial, FacadeBuilder } from './facade.js';
import { GLOBAL, injectGlobals } from './atmosphere.js';

export const XS = [-420, -330, -240, -150, -60, 30, 120, 210];
export const AVX = 300;
export const ZS = [-450, -360, -270, -180, -90, 0, 90, 180, 270, 360, 450];
export const SW = 12;          // pista das ruas
export const AVW = 26;         // pista da avenida (com canteiro central)
export const SIDE = 4;         // largura da calçada
export const CURB = 0.12;      // altura do meio-fio
export const BEACH_X0 = AVX + AVW / 2;       // início do calçadão
export const SAND_X0 = BEACH_X0 + 10;        // início da areia
export const WATER_Y = -0.35;
export const Z_MIN = ZS[0] - 14, Z_MAX = ZS[ZS.length - 1] + 14, X_MIN = XS[0] - 14;
export const SPAWN = { x: 256, z: 45, h: Math.PI / 2 };

const XL = [...XS, AVX];
const roadHalfX = (i) => (XL[i] === AVX ? AVW / 2 : SW / 2);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function sandHeight(x) {
  if (x < SAND_X0) return CURB;
  const d = x - SAND_X0;
  if (d < 48) return 0.06 - d * 0.0125;
  return 0.06 - 48 * 0.0125 - (d - 48) * 0.06;
}

// ---------------------------------------------------------------------------
// Grade espacial de colisores
// ---------------------------------------------------------------------------
class ColliderGrid {
  constructor(cell = 32) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  add(c) {
    const s = this.cell;
    const x0 = Math.floor((c.minX) / s), x1 = Math.floor(c.maxX / s), z0 = Math.floor(c.minZ / s), z1 = Math.floor(c.maxZ / s);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = this.key(ix, iz);
      let a = this.map.get(k);
      if (!a) this.map.set(k, (a = []));
      a.push(c);
    }
  }
  query(x, z) { return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) || []; }
}

export class City {
  constructor(scene, tex, quality) {
    this.scene = scene;
    this.tex = tex;
    this.q = quality;
    this.grid = new ColliderGrid(32);
    this.blocks = [];
    this.walkRects = [];
    this.lamps = [];
    this.palms = [];
    this.trees = [];
    this.tlights = [];
    this.root = new THREE.Group();
    scene.add(this.root);
    this.rand = rng(1234);
    this.buildLayout();
    this.buildGround();
    this.buildBuildings();
    this.buildMarkings();
    this.buildPlaza();
    this.buildOcean();
    this.buildHills();
    this.buildNetwork();
  }

  // -------------------------------------------------------------------------
  buildLayout() {
    for (let i = 0; i < XL.length - 1; i++) {
      for (let j = 0; j < ZS.length - 1; j++) {
        const x0 = XL[i] + roadHalfX(i), x1 = XL[i + 1] - roadHalfX(i + 1);
        const z0 = ZS[j] + SW / 2, z1 = ZS[j + 1] - SW / 2;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        let zone = 'mixed';
        if (i === XL.length - 2) zone = 'beach';
        else if (Math.abs(cx + 40) < 140 && Math.abs(cz) < 150) zone = 'downtown';
        else if (i <= 1) zone = 'houses';
        if (i === XL.length - 2 && j === 5) zone = 'plaza';
        if ((i === 2 && j === 7) || (i === 4 && j === 2)) zone = 'park';
        const b = { i, j, x0, x1, z0, z1, cx, cz, zone };
        this.blocks.push(b);
        this.walkRects.push(b);
      }
    }
  }

  // superfície e altura do chão em (x, z)
  surfaceAt(x, z) {
    if (x > SAND_X0) {
      const h = sandHeight(x);
      if (h < WATER_Y) return { h, type: 'water' };
      return { h, type: 'sand' };
    }
    if (x > BEACH_X0) return { h: CURB, type: 'walk' };
    if (x < X_MIN || z < Z_MIN || z > Z_MAX) return { h: 0, type: 'grass' };
    for (const b of this.walkRects) {
      if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) {
        if (b.zone === 'park') {
          const inner = x > b.x0 + SIDE && x < b.x1 - SIDE && z > b.z0 + SIDE && z < b.z1 - SIDE;
          return { h: CURB, type: inner ? 'grass' : 'walk' };
        }
        return { h: CURB, type: 'walk' };
      }
    }
    // canteiro central da avenida
    if (Math.abs(x - AVX) < 2) return { h: CURB, type: 'walk' };
    return { h: 0, type: 'road' };
  }

  // colisão de um círculo (x,z,r): retorna normal de empurrão ou null
  collide(x, z, r) {
    if (z < Z_MIN || z > Z_MAX || x < X_MIN) {
      const nx = x < X_MIN ? 1 : 0, nz = z < Z_MIN ? 1 : z > Z_MAX ? -1 : 0;
      return { nx, nz, hard: true };
    }
    for (const c of this.grid.query(x, z)) {
      if (c.r) {
        const dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz, rr = c.r + r;
        if (d2 < rr * rr) { const d = Math.sqrt(d2) || 1; return { nx: dx / d, nz: dz / d, pen: rr - d, hard: true, kind: c.kind }; }
      } else if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) {
        // normal pelo lado de menor penetração
        const pl = x - (c.minX - r), pr = c.maxX + r - x, pb = z - (c.minZ - r), pt = c.maxZ + r - z;
        const m = Math.min(pl, pr, pb, pt);
        if (m === pl) return { nx: -1, nz: 0, pen: pl, hard: true, kind: c.kind };
        if (m === pr) return { nx: 1, nz: 0, pen: pr, hard: true, kind: c.kind };
        if (m === pb) return { nx: 0, nz: -1, pen: pb, hard: true, kind: c.kind };
        return { nx: 0, nz: 1, pen: pt, hard: true, kind: c.kind };
      }
    }
    return null;
  }

  addBox(minX, maxX, minZ, maxZ, kind = 'building') { this.grid.add({ minX, maxX, minZ, maxZ, kind }); }
  addCircle(x, z, r, kind = 'pole') { this.grid.add({ x, z, r, minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, kind }); }

  // -------------------------------------------------------------------------
  buildGround() {
    const T = this.tex;
    // grama/terreno de fundo
    const grassMat = T.material('grass', { normalScale: 0.6 });
    // grama só fora da cidade e a oeste da orla (nunca sob a areia ou o asfalto)
    const gx0 = -4000, gx1 = BEACH_X0, gz0 = -4000, gz1 = 4000;
    const gAcc = new GeoAcc();
    const ring = [[gx0, X_MIN - 2, gz0, gz1], [X_MIN - 2, gx1, gz0, Z_MIN - 2], [X_MIN - 2, gx1, Z_MAX + 2, gz1]];
    for (const [a, b, c, d] of ring) gAcc.slabUV(a, b, c, d, -0.02, (x, z) => [x / 10, z / 10]);
    const gGeo = gAcc.build();
    const grass = new THREE.Mesh(gGeo, grassMat);
    grass.receiveShadow = true;
    this.root.add(grass);

    // asfalto (um plano único)
    const asphaltMat = T.material('asphalt', { normalScale: 0.8 });
    this.asphaltMat = asphaltMat;
    const ax0 = X_MIN - 2, ax1 = BEACH_X0, az0 = Z_MIN - 2, az1 = Z_MAX + 2;
    const aGeo = planeXZ(ax0, ax1, az0, az1, 0, 12);
    const asphalt = new THREE.Mesh(aGeo, asphaltMat);
    asphalt.receiveShadow = true;
    this.root.add(asphalt);

    // calçadas (lajes com meio-fio), uma única malha
    const walk = new GeoAcc();
    for (const b of this.blocks) {
      if (b.zone === 'park') {
        // borda de calçada em volta do gramado
        walk.slab(b.x0, b.x1, b.z0, b.z0 + SIDE, CURB, 4);
        walk.slab(b.x0, b.x1, b.z1 - SIDE, b.z1, CURB, 4);
        walk.slab(b.x0, b.x0 + SIDE, b.z0 + SIDE, b.z1 - SIDE, CURB, 4);
        walk.slab(b.x1 - SIDE, b.x1, b.z0 + SIDE, b.z1 - SIDE, CURB, 4);
      } else walk.slab(b.x0, b.x1, b.z0, b.z1, CURB, 4);
    }
    // canteiro central da avenida
    walk.slab(AVX - 2, AVX + 2, Z_MIN, Z_MAX, CURB, 4);
    const walkMesh = new THREE.Mesh(walk.build(), T.material('concrete', { normalScale: 0.7 }));
    walkMesh.receiveShadow = true;
    this.root.add(walkMesh);

    // gramados dos parques
    const park = new GeoAcc();
    for (const b of this.blocks) if (b.zone === 'park') park.slab(b.x0 + SIDE, b.x1 - SIDE, b.z0 + SIDE, b.z1 - SIDE, CURB - 0.02, 6, true);
    const parkMesh = new THREE.Mesh(park.build(), T.material('grass', { normalScale: 0.6 }));
    parkMesh.receiveShadow = true;
    this.root.add(parkMesh);

    // calçadão de ondas
    const wave = new GeoAcc();
    wave.slabUV(BEACH_X0, SAND_X0, Z_MIN - 30, Z_MAX + 30, CURB, (x, z) => [z / 8, (x - BEACH_X0) / 8]);
    const waveMesh = new THREE.Mesh(wave.build(), T.material('wave', { normalScale: 0.6 }));
    waveMesh.receiveShadow = true;
    this.root.add(waveMesh);

    // areia (malha com declive até o mar)
    const nx = 60, nz = 2;
    const sx0 = SAND_X0, sx1 = SAND_X0 + 140, sz0 = Z_MIN - 300, sz1 = Z_MAX + 300;
    const sGeo = new THREE.BufferGeometry();
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nx; i++) {
      const x = sx0 + (sx1 - sx0) * (i / nx) ** 1.4;
      for (let k = 0; k <= nz; k++) {
        const z = sz0 + (sz1 - sz0) * k / nz;
        pos.push(x, sandHeight(x), z); uv.push(x / 10, z / 10);
      }
    }
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const a = i * (nz + 1) + k, b2 = a + nz + 1;
      idx.push(a, a + 1, b2, a + 1, b2 + 1, b2);
    }
    sGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    sGeo.setIndex(idx);
    sGeo.computeVertexNormals();
    const sand = new THREE.Mesh(sGeo, T.material('sand', { normalScale: 0.5 }));
    sand.receiveShadow = true;
    this.root.add(sand);
  }

  // -------------------------------------------------------------------------
  buildBuildings() {
    const rand = this.rand;
    const chunks = new Map();
    const CH = 180;
    const getChunk = (x, z) => {
      const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
      let c = chunks.get(k);
      if (!c) chunks.set(k, (c = new FacadeBuilder()));
      return c;
    };
    const pastel = ['#efe6d4', '#f2d7c4', '#dfe8ee', '#e9e2c6', '#f1f0ec', '#d9c3a5', '#c9d8cc', '#f0cfd2', '#e3dcf0', '#d4d0c8'];
    const glass = ['#3b6f8f', '#2f5a6e', '#5c7f8c', '#6b5a43', '#3f6b5c', '#47566b'];
    const house = ['#e8c07a', '#d97a5a', '#7aa6c2', '#9ec27a', '#e0e0d6', '#c98bb0', '#f0d48a'];
    const col = new THREE.Color();
    const lin = (hex) => col.set(hex).clone();

    for (const b of this.blocks) {
      if (b.zone === 'plaza' || b.zone === 'park') continue;
      const ix0 = b.x0 + SIDE, ix1 = b.x1 - SIDE, iz0 = b.z0 + SIDE, iz1 = b.z1 - SIDE;
      const lots = perimeterLots(ix0, ix1, iz0, iz1, b.zone === 'downtown' ? 26 : b.zone === 'beach' ? 22 : 15, rand);
      for (const L of lots) {
        let style, H, color;
        const gap = 0.4 + rand() * 1.2;
        const x0 = L.x0 + gap, x1 = L.x1 - gap, z0 = L.z0 + gap, z1 = L.z1 - gap;
        if (x1 - x0 < 5 || z1 - z0 < 5) continue;
        const r = rand();
        if (b.zone === 'beach') {
          const facesSea = L.x1 > ix1 - 1;
          if (r < 0.75 || facesSea) { style = 0; H = 4.2 + 2.9 * Math.floor(8 + rand() * (facesSea ? 12 : 8)); color = lin(pastel[(rand() * pastel.length) | 0]); }
          else { style = 3; H = 4.2 + 3.1 * Math.floor(3 + rand() * 4); color = lin(pastel[(rand() * pastel.length) | 0]); }
        } else if (b.zone === 'downtown') {
          if (r < 0.6) { style = 1; H = 3.6 * Math.floor(12 + rand() * 26); color = lin(glass[(rand() * glass.length) | 0]); }
          else { style = 2; H = 4.2 + 3.2 * Math.floor(4 + rand() * 8); color = lin(pastel[(rand() * pastel.length) | 0]); }
        } else if (b.zone === 'houses') {
          if (r < 0.7) { style = 4; H = 2.9 * (1 + Math.floor(rand() * 2)) + 0.6; color = lin(house[(rand() * house.length) | 0]); }
          else { style = 2; H = 4.2 + 3.2 * Math.floor(1 + rand() * 3); color = lin(pastel[(rand() * pastel.length) | 0]); }
        } else {
          if (r < 0.4) { style = 2; H = 4.2 + 3.2 * Math.floor(2 + rand() * 6); }
          else if (r < 0.7) { style = 3; H = 4.2 + 3.1 * Math.floor(2 + rand() * 5); }
          else { style = 0; H = 4.2 + 2.9 * Math.floor(4 + rand() * 9); }
          color = lin(pastel[(rand() * pastel.length) | 0]);
        }
        const seed = rand() * 100;
        const fb = getChunk((x0 + x1) / 2, (z0 + z1) / 2);
        fb.box(x0, x1, z0, z1, 0, H, color, style, seed);
        this.addBox(x0, x1, z0, z1);
        // coroamento / platibanda
        const pc = color.clone().multiplyScalar(0.9);
        fb.box(x0 - 0.15, x1 + 0.15, z0 - 0.15, z1 + 0.15, H, H + 0.7, pc, -2, seed, { roofStyle: -2 });
        // casa de máquinas e caixa d'água
        if (H > 12) {
          const mw = Math.min(6, (x1 - x0) * 0.4), md = Math.min(6, (z1 - z0) * 0.4);
          const mx = (x0 + x1) / 2 + (rand() - 0.5) * 4, mz = (z0 + z1) / 2 + (rand() - 0.5) * 4;
          fb.box(mx - mw / 2, mx + mw / 2, mz - md / 2, mz + md / 2, H, H + 3.2, new THREE.Color(0.55, 0.55, 0.53), -2, seed, { roofStyle: -1 });
          for (let k = 0; k < 3; k++) {
            const ax = x0 + 1.5 + rand() * (x1 - x0 - 3), az = z0 + 1.5 + rand() * (z1 - z0 - 3);
            fb.box(ax - 0.6, ax + 0.6, az - 0.5, az + 0.5, H, H + 0.9, new THREE.Color(0.62, 0.62, 0.6), -2, seed, { roofStyle: -2 });
          }
        }
        // sacadas nos residenciais, nas faces voltadas para a rua
        if (style === 0) {
          const slab = new THREE.Color(0.92, 0.91, 0.88), rail = new THREE.Color(0.12, 0.13, 0.14);
          const faces = [];
          if (L.x1 > ix1 - 1) faces.push('+x');
          if (L.x0 < ix0 + 1) faces.push('-x');
          if (L.z1 > iz1 - 1) faces.push('+z');
          if (L.z0 < iz0 + 1) faces.push('-z');
          for (let y = 4.2 + 2.9 - 0.15; y < H - 1; y += 2.9) {
            for (const f of faces) {
              const D = 1.15, t = 0.16;
              if (f === '+x') { fb.box(x1, x1 + D, z0 + 0.8, z1 - 0.8, y, y + t, slab, -2, seed, { roofStyle: -2, bottom: true }); fb.box(x1 + D - 0.04, x1 + D, z0 + 0.8, z1 - 0.8, y + t, y + 1.05, rail, -2, seed, { roofStyle: -2 }); }
              if (f === '-x') { fb.box(x0 - D, x0, z0 + 0.8, z1 - 0.8, y, y + t, slab, -2, seed, { roofStyle: -2, bottom: true }); fb.box(x0 - D, x0 - D + 0.04, z0 + 0.8, z1 - 0.8, y + t, y + 1.05, rail, -2, seed, { roofStyle: -2 }); }
              if (f === '+z') { fb.box(x0 + 0.8, x1 - 0.8, z1, z1 + D, y, y + t, slab, -2, seed, { roofStyle: -2, bottom: true }); fb.box(x0 + 0.8, x1 - 0.8, z1 + D - 0.04, z1 + D, y + t, y + 1.05, rail, -2, seed, { roofStyle: -2 }); }
              if (f === '-z') { fb.box(x0 + 0.8, x1 - 0.8, z0 - D, z0, y, y + t, slab, -2, seed, { roofStyle: -2, bottom: true }); fb.box(x0 + 0.8, x1 - 0.8, z0 - D, z0 - D + 0.04, y + t, y + 1.05, rail, -2, seed, { roofStyle: -2 }); }
            }
          }
        }
        // toldos nas lojas
        if (style === 2 && rand() < 0.6) {
          const aw = new THREE.Color().setHSL(rand(), 0.55, 0.35);
          if (L.z1 > iz1 - 1) fb.box(x0 + 0.5, x1 - 0.5, z1, z1 + 1.6, 3.2, 3.4, aw, -2, seed, { roofStyle: -2, bottom: true });
          if (L.x0 < ix0 + 1) fb.box(x0 - 1.6, x0, z0 + 0.5, z1 - 0.5, 3.2, 3.4, aw, -2, seed, { roofStyle: -2, bottom: true });
        }
      }
    }
    this.facadeMat = createFacadeMaterial();
    this.buildingMeshes = [];
    for (const fb of chunks.values()) {
      const m = new THREE.Mesh(fb.build(), this.facadeMat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
      this.buildingMeshes.push(m);
    }
  }

  // -------------------------------------------------------------------------
  buildMarkings() {
    const acc = new GeoAcc();
    const white = new THREE.Color(0.85, 0.85, 0.82), yellow = new THREE.Color(0.85, 0.62, 0.08);
    const y = 0.012;
    const isNearX = (x, z) => { for (let i = 0; i < XL.length; i++) if (Math.abs(x - XL[i]) < roadHalfX(i) + 2) return true; return false; };
    const isNearZ = (z) => ZS.some((zz) => Math.abs(z - zz) < SW / 2 + 2);
    // ruas N-S (ao longo de z)
    for (let i = 0; i < XL.length; i++) {
      const x = XL[i];
      if (x === AVX) {
        for (let z = Z_MIN; z < Z_MAX; z += 6) {
          if (isNearZ(z) || isNearZ(z + 3)) continue;
          for (const lx of [-9.0, -5.5, 5.5, 9.0]) acc.rect(x + lx - 0.07, x + lx + 0.07, z, z + 3, y, white);
        }
        for (const lx of [-2.3, 2.3, -12.6, 12.6]) acc.rect(x + lx - 0.08, x + lx + 0.08, Z_MIN, Z_MAX, y, white);
      } else {
        for (let z = Z_MIN; z < Z_MAX; z += 4) {
          if (isNearZ(z) || isNearZ(z + 2)) continue;
          acc.rect(x - 0.18, x - 0.06, z, z + 2.4, y, yellow);
          acc.rect(x + 0.06, x + 0.18, z, z + 2.4, y, yellow);
        }
      }
    }
    // ruas L-O (ao longo de x)
    for (const z of ZS) {
      for (let x = X_MIN; x < AVX; x += 4) {
        if (isNearX(x, z) || isNearX(x + 2, z)) continue;
        acc.rect(x, x + 2.4, z - 0.18, z - 0.06, y, yellow);
        acc.rect(x, x + 2.4, z + 0.06, z + 0.18, y, yellow);
      }
    }
    // faixas de pedestre e linhas de retenção
    for (let i = 0; i < XL.length; i++) for (const z of ZS) {
      const x = XL[i], hw = roadHalfX(i);
      // travessia cruzando a rua N-S (antes do cruzamento)
      for (const s of [-1, 1]) {
        const zc = z + s * (SW / 2 + 2.2);
        for (let xx = x - hw + 0.5; xx < x + hw - 0.5; xx += 1.0) acc.rect(xx, xx + 0.55, zc - 1.5, zc + 1.5, y, white);
        acc.rect(x - (s > 0 ? hw : 0), x + (s > 0 ? 0 : hw), zc + s * 2.0 - 0.2, zc + s * 2.0 + 0.2, y, white);
      }
      for (const s of [-1, 1]) {
        if (x === AVX && s > 0) continue;
        const xc = x + s * (hw + 2.2);
        for (let zz = z - SW / 2 + 0.5; zz < z + SW / 2 - 0.5; zz += 1.0) acc.rect(xc - 1.5, xc + 1.5, zz, zz + 0.55, y, white);
      }
    }
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(acc.build(), m);
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  // praça de treino: pista de grau com marcas de distância, círculo de giro e logo pintado
  buildPlaza() {
    const b = this.blocks.find((x) => x.zone === 'plaza');
    if (!b) return;
    const acc = new GeoAcc();
    const paint = new THREE.Color(0.82, 0.8, 0.75), yel = new THREE.Color(0.9, 0.6, 0.05), y = CURB + 0.008;
    const lx0 = b.x0 + 10, lx1 = b.x1 - 10, lz = b.z0 + 16;
    // pista reta (leste-oeste) com marcas a cada 10 m
    acc.rect(lx0, lx1, lz - 3.2, lz - 3.0, y, paint);
    acc.rect(lx0, lx1, lz + 3.0, lz + 3.2, y, paint);
    for (let x = lx0; x <= lx1; x += 10) acc.rect(x - 0.12, x + 0.12, lz - 3.2, lz + 3.2, y, yel);
    acc.rect(lx0 - 0.3, lx0 + 0.3, lz - 3.2, lz + 3.2, y, paint);
    // círculo para grau de giro
    const cx = (b.x0 + b.x1) / 2 + 8, cz = (b.z0 + b.z1) / 2 + 10, R = 13;
    for (let i = 0; i < 64; i++) {
      const a0 = (i / 64) * Math.PI * 2, a1 = ((i + 1) / 64) * Math.PI * 2;
      for (const [r0, r1] of [[R - 0.15, R + 0.15], [R * 0.5 - 0.12, R * 0.5 + 0.12]]) {
        acc.quad([[cx + Math.cos(a0) * r0, y, cz + Math.sin(a0) * r0], [cx + Math.cos(a0) * r1, y, cz + Math.sin(a0) * r1], [cx + Math.cos(a1) * r1, y, cz + Math.sin(a1) * r1], [cx + Math.cos(a1) * r0, y, cz + Math.sin(a1) * r0]].reverse(), [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], i % 4 < 2 ? paint : yel);
      }
    }
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(acc.build(), m);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    // logo pintado no chão
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
    const x = cv.getContext('2d');
    x.font = 'italic 900 170px Inter, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const gr = x.createLinearGradient(200, 0, 824, 0); gr.addColorStop(0, '#ff4f8b'); gr.addColorStop(1, '#ff9a3c');
    x.fillStyle = 'rgba(240,236,228,0.92)'; x.fillText('GRAU', 330, 128);
    x.fillStyle = gr; x.fillText('LIVRE', 700, 128);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(36, 9), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    logo.rotation.x = -Math.PI / 2;
    logo.rotation.z = Math.PI / 2;
    logo.position.set(b.x1 - 14, CURB + 0.01, (b.z0 + b.z1) / 2 + 6);
    logo.receiveShadow = true;
    this.root.add(logo);
    this.plazaLane = { x0: lx0, x1: lx1, z: lz };
  }

  // -------------------------------------------------------------------------
  buildOcean() {
    const n = this.tex.surface('asphalt'); void n;
    const geo = new THREE.PlaneGeometry(8000, 8000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c3a46, roughness: 0.06, metalness: 0.0 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = GLOBAL.uTime;
      shader.uniforms.uNight = GLOBAL.uNight;
      injectGlobals(shader);
      shader.uniforms.uShore = { value: SAND_X0 + (0.06 - WATER_Y) / 0.0125 };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vWPos; uniform float uTime; uniform float uShore; uniform float uNight;
        float whash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float wnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(whash(i), whash(i+vec2(1,0)), u.x), mix(whash(i+vec2(0,1)), whash(i+vec2(1,1)), u.x), u.y); }
        float wave(vec2 p){ float h = 0.0; float a = 0.5; vec2 d = vec2(1.0, 0.25);
          for (int i = 0; i < 5; i++){ h += a * (wnoise(p + d * uTime * (0.6 + float(i) * 0.25)) ); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; }
          return h; }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 p = vWPos.xz * 0.12;
          float e = 0.05;
          float h0 = wave(p), hx = wave(p + vec2(e, 0.0)), hz = wave(p + vec2(0.0, e));
          float distFade = 1.0 - smoothstep(60.0, 900.0, length(vWPos - cameraPosition));
          vec3 wn = normalize(vec3(-(hx - h0) / e * 0.35 * distFade, 1.0, -(hz - h0) / e * 0.35 * distFade));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float sd = vWPos.x - uShore;
          vec3 shallow = vec3(0.06, 0.32, 0.30);
          vec3 deep = vec3(0.01, 0.07, 0.10);
          diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 90.0, sd)) * mix(1.0, 0.25, uNight);
          float foamLine = smoothstep(4.0, 0.0, abs(sd - 1.5 + 1.8 * sin(vWPos.z * 0.05 + uTime * 0.6) + 2.0 * sin(uTime * 0.35 + vWPos.z * 0.013)));
          float foamN = wnoise(vWPos.xz * 0.6 + uTime * 0.4);
          float foam = clamp(foamLine * smoothstep(0.35, 0.75, foamN + foamLine * 0.3), 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85) * mix(1.0, 0.3, uNight), foam);
        }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(0.05, 0.6, smoothstep(5.0, 0.0, abs(vWPos.x - uShore - 1.5)));`);
    };
    mat.customProgramCacheKey = () => 'ocean-v1';
    const ocean = new THREE.Mesh(geo, mat);
    ocean.position.set(SAND_X0 + 25 + 4000, WATER_Y, 0);
    ocean.receiveShadow = true;
    this.ocean = ocean;
    this.root.add(ocean);
  }

  // morros ao fundo
  buildHills() {
    const rand = rng(99);
    const geos = [];
    const spots = [[-1100, -500, 380, 230], [-1050, 300, 450, 300], [-700, -1150, 380, 210], [-300, 1200, 520, 260], [500, -1300, 220, 260], [700, -1150, 140, 180],
      [-1500, -100, 600, 360], [200, 1500, 400, 200], [900, 1300, 200, 140]];
    for (const [x, z, r, h] of spots) {
      const g = new THREE.IcosahedronGeometry(1, 4);
      const p = g.attributes.position;
      const s = rand() * 100;
      for (let i = 0; i < p.count; i++) {
        let vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        const n = Math.sin(vx * 3.1 + s) * Math.cos(vz * 2.7 + s) * 0.18 + Math.sin(vx * 7.3 + vz * 5.1 + s) * 0.06;
        const k = 1 + n;
        p.setXYZ(i, vx * r * k, Math.max(vy, -0.2) * h * k, vz * r * k);
      }
      g.computeVertexNormals();
      g.translate(x, -8, z);
      geos.push(g);
    }
    const merged = mergeGeos(geos);
    const colors = [];
    const p = merged.attributes.position, n = merged.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const steep = 1 - n.getY(i);
      const rock = steep > 0.45 ? 1 : 0;
      const c = rock ? [0.22, 0.21, 0.2] : [0.07, 0.12, 0.05];
      colors.push(...c);
    }
    merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    this.root.add(mesh);
  }

  // -------------------------------------------------------------------------
  // Malha viária para o trânsito: nós nos cruzamentos, arestas nas ruas
  buildNetwork() {
    const nodes = [], edges = [];
    const id = (i, j) => i * ZS.length + j;
    for (let i = 0; i < XL.length; i++) for (let j = 0; j < ZS.length; j++) {
      nodes.push({ id: id(i, j), x: XL[i], z: ZS[j], out: [], light: XL[i] === AVX, hw: roadHalfX(i) });
    }
    const addEdge = (a, b, lanes, offs) => {
      const A = nodes[a], B = nodes[b];
      const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
      const e = { id: edges.length, a, b, len, dx: dx / len, dz: dz / len, lanes, offs, cars: [], axis: Math.abs(dx) > Math.abs(dz) ? 'x' : 'z' };
      edges.push(e);
      A.out.push(e);
      return e;
    };
    for (let i = 0; i < XL.length; i++) for (let j = 0; j < ZS.length; j++) {
      const av = XL[i] === AVX;
      if (j < ZS.length - 1) {
        const offs = av ? [5.4, 9.0] : [2.6];
        addEdge(id(i, j), id(i, j + 1), offs.length, offs);
        addEdge(id(i, j + 1), id(i, j), offs.length, offs);
      }
      if (i < XL.length - 1) {
        addEdge(id(i, j), id(i + 1, j), 1, [2.6]);
        addEdge(id(i + 1, j), id(i, j), 1, [2.6]);
      }
    }
    this.net = { nodes, edges };
  }
}

// ---------------------------------------------------------------------------
// Utilitários de geometria
// ---------------------------------------------------------------------------
function scaleUV(geo, s) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s); }

function planeXZ(x0, x1, z0, z1, y, tile) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([x0 / tile, z0 / tile, x1 / tile, z0 / tile, x1 / tile, z1 / tile, x0 / tile, z1 / tile], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

export class GeoAcc {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.v = 0; this.hasColor = false; }
  quad(ps, n, uvs, color) {
    const b = this.v;
    for (let k = 0; k < 4; k++) {
      this.pos.push(...ps[k]); this.nor.push(...n); this.uv.push(...uvs[k]);
      if (color) { this.col.push(color.r, color.g, color.b); this.hasColor = true; } else this.col.push(1, 1, 1);
    }
    this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    this.v += 4;
  }
  // laje com topo e laterais (meio-fio)
  slab(x0, x1, z0, z1, h, tile, topOnly = false) {
    const t = tile;
    this.quad([[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]], [0, 1, 0], [[x0 / t, z0 / t], [x1 / t, z0 / t], [x1 / t, z1 / t], [x0 / t, z1 / t]]);
    if (topOnly) return;
    this.quad([[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]].reverse(), [0, 0, 1], [[x0 / t, h / t], [x1 / t, h / t], [x1 / t, 0], [x0 / t, 0]]);
    this.quad([[x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0]], [0, 0, -1], [[x0 / t, 0], [x1 / t, 0], [x1 / t, h / t], [x0 / t, h / t]]);
    this.quad([[x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0]], [1, 0, 0], [[z0 / t, 0], [z1 / t, 0], [z1 / t, h / t], [z0 / t, h / t]]);
    this.quad([[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]].reverse(), [-1, 0, 0], [[z0 / t, h / t], [z1 / t, h / t], [z1 / t, 0], [z0 / t, 0]]);
  }
  slabUV(x0, x1, z0, z1, h, uvf) {
    this.quad([[x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]], [0, 1, 0], [uvf(x0, z0), uvf(x1, z0), uvf(x1, z1), uvf(x0, z1)]);
    this.quad([[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]].reverse(), [-1, 0, 0], [[0, 0], [1, 0], [1, 0.02], [0, 0.02]]);
  }
  rect(x0, x1, z0, z1, y, color) {
    this.quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]], color);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.hasColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// lotes ao longo do perímetro da quadra
function perimeterLots(x0, x1, z0, z1, depth, rand) {
  const lots = [];
  const d = Math.min(depth + rand() * 6, (x1 - x0) / 2, (z1 - z0) / 2);
  const split = (a, b, minW, maxW) => {
    const out = [];
    let p = a;
    while (p < b - 0.1) {
      let w = minW + rand() * (maxW - minW);
      if (b - (p + w) < minW) w = b - p;
      out.push([p, p + w]);
      p += w;
    }
    return out;
  };
  const wmin = depth * 0.7, wmax = depth * 1.4;
  // faixas norte/sul (largura total)
  for (const [a, b] of split(x0, x1, wmin, wmax)) {
    lots.push({ x0: a, x1: b, z0: z1 - d, z1 });
    lots.push({ x0: a, x1: b, z0: z0, z1: z0 + d });
  }
  // faixas leste/oeste (entre as norte/sul)
  for (const [a, b] of split(z0 + d, z1 - d, wmin, wmax)) {
    lots.push({ x0: x1 - d, x1, z0: a, z1: b });
    lots.push({ x0, x1: x0 + d, z0: a, z1: b });
  }
  return lots;
}

export function mergeGeos(geos) {
  let total = 0, itotal = 0;
  for (const g of geos) { total += g.attributes.position.count; itotal += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const idx = new Uint32Array(itotal);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo; io += g.index.count; }
    else { for (let i = 0; i < g.attributes.position.count; i++) idx[io + i] = vo + i; io += g.attributes.position.count; }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
