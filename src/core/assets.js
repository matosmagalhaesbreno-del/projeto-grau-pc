// Modelos GLB embutidos no bundle (carregados de memória: funciona via file://)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import s1000rr from '../../assets/models/opt/s1000rr.glb';
import zx10r from '../../assets/models/opt/zx10r.glb';
import mt09 from '../../assets/models/opt/mt09.glb';
import xj6 from '../../assets/models/opt/xj6.glb';
import g310gs from '../../assets/models/opt/g310gs.glb';
import xre300 from '../../assets/models/opt/xre300.glb';
import bros160 from '../../assets/models/opt/bros160.glb';
import cg160 from '../../assets/models/opt/cg160.glb';
import rider from '../../assets/models/opt/rider.glb';
import carHatch from '../../assets/models/opt/car_hatch.glb';
import carSedan from '../../assets/models/opt/car_sedan.glb';
import carSuv from '../../assets/models/opt/car_suv.glb';
import carPickup from '../../assets/models/opt/car_pickup.glb';
import palm from '../../assets/models/opt/palm.glb';
import lamp from '../../assets/models/opt/lamp.glb';
import tlight from '../../assets/models/opt/tlight.glb';

const SRC = { s1000rr, zx10r, mt09, xj6, g310gs, xre300, bros160, cg160, rider, car_hatch: carHatch, car_sedan: carSedan, car_suv: carSuv, car_pickup: carPickup, palm, lamp, tlight };

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = {};

export async function loadModel(name) {
  if (cache[name]) return cache[name];
  const u8 = SRC[name];
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  await MeshoptDecoder.ready;
  const gltf = await new Promise((res, rej) => loader.parse(buf, '', res, rej));
  cache[name] = gltf;
  return gltf;
}

// Clona a cena de um modelo (materiais clonados para poderem ser personalizados)
export function cloneScene(gltf) {
  const s = gltf.scene.clone(true);
  s.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
  return s;
}

// Extrai as malhas de um modelo como [{geometry (com transformação aplicada), material, name}]
export function bakeParts(gltf, filter) {
  const out = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (filter && !filter(o)) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    out.push({ geometry: g, material: o.material, name: o.name, parent: o.parent && o.parent.name });
  });
  return out;
}

export const MODEL_NAMES = Object.keys(SRC);
export { THREE };
