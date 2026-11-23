// Empacotamento de materiais: junta várias malhas com materiais diferentes numa única malha
// (1 chamada de desenho), guardando cor/rugosidade/metal/verniz/emissão por vértice.
import * as THREE from 'three';

// classes de vértice com cor/brilho controlados em tempo real
export const CLS = { none: 0, paint: 1, rim: 2, head: 3, tail: 4, drl: 5, signal: 6, dash: 7, jacket: 8, helmet: 9, glassCar: 10 };
const CLASS_OF = {
  paint_main: CLS.paint, rim: CLS.rim, light_head: CLS.head, light_tail: CLS.tail, light_drl: CLS.drl, light_signal: CLS.signal, dash: CLS.dash,
  jacket: CLS.jacket, helmet: CLS.helmet, paint: CLS.paint, light_front: CLS.head, light_rear: CLS.tail,
};

export function isTransparent(mat) { return mat.transparent || mat.opacity < 1 || mat.name === 'windscreen' || mat.name === 'lens' || mat.name === 'plate'; }

// parts: [{ geometry (no espaço final), material }]
export function packGeometry(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.geometry.attributes.position.count; ni += p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), pbr = new Float32Array(nv * 4), em = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  const c = new THREE.Color();
  for (const p of parts) {
    const g = p.geometry, m = p.material, n = g.attributes.position.count;
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      pos[(vo + i) * 3] = P.getX(i); pos[(vo + i) * 3 + 1] = P.getY(i); pos[(vo + i) * 3 + 2] = P.getZ(i);
      if (N) { nor[(vo + i) * 3] = N.getX(i); nor[(vo + i) * 3 + 1] = N.getY(i); nor[(vo + i) * 3 + 2] = N.getZ(i); } else nor[(vo + i) * 3 + 1] = 1;
    }
    c.copy(m.color || new THREE.Color(1, 1, 1));
    const rough = m.roughness !== undefined ? m.roughness : 0.6, metal = m.metalness || 0, coat = m.clearcoat || 0;
    const cls = CLASS_OF[m.name] || 0;
    const e = m.emissive ? m.emissive.clone().multiplyScalar(m.emissiveIntensity !== undefined ? m.emissiveIntensity : 1) : new THREE.Color(0, 0, 0);
    for (let i = 0; i < n; i++) {
      col.set([c.r, c.g, c.b], (vo + i) * 3);
      pbr.set([rough, metal, coat, cls], (vo + i) * 4);
      em.set([e.r, e.g, e.b], (vo + i) * 3);
    }
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo; io += g.index.count; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aPbr', new THREE.BufferAttribute(pbr, 4));
  out.setAttribute('aEm', new THREE.BufferAttribute(em, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Material compartilhado que lê os atributos empacotados.
// uniforms: cores de pintura/aro/jaqueta/capacete e intensidades das luzes.
export function packedMaterial(opts = {}) {
  const U = {
    uPaint: { value: new THREE.Color(1, 1, 1) }, uUsePaint: { value: 0 },
    uRim: { value: new THREE.Color(1, 1, 1) }, uUseRim: { value: 0 },
    uJacket: { value: new THREE.Color(1, 1, 1) }, uUseJacket: { value: 0 },
    uHelmet: { value: new THREE.Color(1, 1, 1) }, uUseHelmet: { value: 0 },
    uHead: { value: 1 }, uTail: { value: 1 }, uDrl: { value: 1 }, uSignal: { value: 0.3 }, uDash: { value: 1 },
  };
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, clearcoat: 1, clearcoatRoughness: 0.05, roughness: 1, metalness: 1 });
  const instanced = !!opts.instanced;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.uniforms.uFogSunDir = opts.globals.uFogSunDir; shader.uniforms.uFogSunColor = opts.globals.uFogSunColor; shader.uniforms.uFogHeight = opts.globals.uFogHeight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aPbr; attribute vec3 aEm; varying vec4 vPbr; varying vec3 vEm;
        ${instanced ? 'attribute vec3 aPaintI; attribute float aBrakeI; varying vec3 vPaintI; varying float vBrakeI;' : ''}`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        vPbr = aPbr; vEm = aEm;
        ${instanced ? 'vPaintI = aPaintI; vBrakeI = aBrakeI;' : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vPbr; varying vec3 vEm;
        ${instanced ? 'varying vec3 vPaintI; varying float vBrakeI;' : ''}
        uniform vec3 uPaint, uRim, uJacket, uHelmet; uniform float uUsePaint, uUseRim, uUseJacket, uUseHelmet;
        uniform float uHead, uTail, uDrl, uSignal, uDash;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float cls = floor(vPbr.w + 0.5);
        ${instanced ? 'if (cls == 1.0) diffuseColor.rgb = vPaintI;' : 'if (cls == 1.0 && uUsePaint > 0.5) diffuseColor.rgb = uPaint;'}
        if (cls == 2.0 && uUseRim > 0.5) diffuseColor.rgb = uRim;
        if (cls == 8.0 && uUseJacket > 0.5) diffuseColor.rgb = uJacket;
        if (cls == 9.0 && uUseHelmet > 0.5) diffuseColor.rgb = uHelmet;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPbr.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPbr.y;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat *= vPbr.z;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float ek = cls == 3.0 ? uHead : cls == 4.0 ? ${instanced ? 'mix(uTail, 6.0, vBrakeI)' : 'uTail'} : cls == 5.0 ? uDrl : cls == 6.0 ? uSignal : cls == 7.0 ? uDash : 1.0;
        totalEmissiveRadiance += vEm * ek;`);
  };
  m.customProgramCacheKey = () => 'packed' + (instanced ? 'I' : '');
  m.userData.U = U;
  return m;
}

// Substitui os filhos-malha de um nó por uma malha empacotada (transparentes e com textura ficam à parte)
export function packNode(node, material, stopAt) {
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  const parts = [], keep = [], remove = [];
  const visit = (o) => {
    if (o !== node && stopAt && stopAt.has(o.name)) return;
    if (o.isMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const mat = mats[0];
      if (isTransparent(mat) || mat.map) { keep.push(o); }
      else {
        const g = o.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        parts.push({ geometry: g, material: mat });
        remove.push(o);
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(node);
  for (const o of remove) {
    if (o === node) continue;
    o.parent.remove(o);
  }
  if (!parts.length) return null;
  const geo = packGeometry(parts);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = node.name + '_packed';
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (node.isMesh) {
    // o próprio nó era uma malha: transforma em grupo vazio mantendo transformação
    node.geometry = new THREE.BufferGeometry();
    node.visible = true;
    node.material = new THREE.MeshBasicMaterial({ visible: false });
  }
  node.add(mesh);
  return mesh;
}
