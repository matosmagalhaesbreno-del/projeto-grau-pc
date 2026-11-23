// Material de fachada procedural: janelas com interior mapping (profundidade falsa do cômodo),
// vidro refletivo, cômodos acesos à noite, lojas no térreo, néon em prédios art déco.
import * as THREE from 'three';
import { GLOBAL, injectGlobals } from './atmosphere.js';

// aFac = (estilo, semente, altura do prédio, largura da parede)
// estilos: -1 telhado, -2 concreto liso (sacadas), 0 residencial, 1 vidro (escritório), 2 comercial, 3 art déco, 4 casa
export function createFacadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
  m.onBeforeCompile = (shader) => {
    injectGlobals(shader);
    shader.uniforms.uNight = GLOBAL.uNight;
    shader.uniforms.uTime = GLOBAL.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aFac;
        varying vec4 vFac;
        varying vec2 vWallUv;
        varying vec3 vWNormal;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vFac = aFac;
        vWallUv = uv;
        vWNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        uniform float uTime;
        varying vec4 vFac;
        varying vec2 vWallUv;
        varying vec3 vWNormal;
        float fhash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float fnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(fhash(i), fhash(i+vec2(1,0)), u.x), mix(fhash(i+vec2(0,1)), fhash(i+vec2(1,1)), u.x), u.y); }
        // resultado da fachada
        struct Fac { vec3 albedo; float rough; float metal; vec3 emit; };
        // Interior mapping: raio dentro de uma caixa [0,1]x[0,1]x[-depth,0]
        vec3 interior(vec2 f, vec3 rd, float seed, float lit, float depth){
          vec3 ro = vec3(f, 0.0);
          vec3 tv = vec3((rd.x > 0.0 ? 1.0 : 0.0) - ro.x, (rd.y > 0.0 ? 1.0 : 0.0) - ro.y, -depth - ro.z) / rd;
          float t = min(min(tv.x, tv.y), tv.z);
          vec3 h = ro + rd * t;
          vec3 wallC = mix(vec3(0.55, 0.48, 0.40), vec3(0.42, 0.45, 0.5), fhash(vec2(seed, 3.1)));
          vec3 col;
          if (t == tv.z) { // parede do fundo, com um "quadro"/móvel
            col = wallC * (0.85 + 0.3 * step(0.6, fhash(vec2(seed, 7.0))) * step(abs(h.x - 0.5), 0.2) * step(abs(h.y - 0.55), 0.15));
          } else if (t == tv.y) { col = rd.y > 0.0 ? vec3(0.9, 0.88, 0.82) : vec3(0.28, 0.2, 0.14); }
          else { col = wallC * 0.75; }
          float depthShade = 1.0 - clamp(-h.z / depth, 0.0, 1.0) * 0.45;
          vec3 light = mix(vec3(1.0, 0.82, 0.55), vec3(0.75, 0.85, 1.0), step(0.75, fhash(vec2(seed, 11.0))));
          return col * depthShade * mix(0.08, 1.0, lit) * mix(vec3(1.0), light, lit);
        }
        Fac facade(vec3 baseCol, vec3 V){
          Fac F; F.albedo = baseCol; F.rough = 0.85; F.metal = 0.0; F.emit = vec3(0.0);
          float style = floor(vFac.x + 0.5);
          float seed = vFac.y; float H = vFac.z; float W = vFac.w;
          vec2 uvm = vWallUv;
          // sujeira e variação de cor
          float n = fnoise(uvm * 0.35 + seed * 13.0) * 0.6 + fnoise(uvm * 2.0) * 0.4;
          F.albedo *= 0.86 + 0.22 * n;
          F.albedo *= mix(0.72, 1.0, smoothstep(0.0, 3.5, uvm.y));
          if (style < -1.5) { F.rough = 0.8; return F; }
          if (style < -0.5) { // telhado
            F.albedo = vec3(0.24, 0.23, 0.22) * (0.8 + 0.3 * fnoise(uvm * 1.5 + seed));
            F.rough = 0.95; return F;
          }
          // parâmetros por estilo: célula (w,h), janela (w,h), base da janela
          vec2 cell = vec2(3.2, 2.9), win = vec2(1.8, 1.55); float sill = 0.8; float depth = 1.4;
          if (style > 0.5 && style < 1.5) { cell = vec2(1.6, 3.6); win = vec2(1.5, 3.45); sill = 0.08; depth = 2.0; }
          else if (style > 1.5 && style < 2.5) { cell = vec2(2.7, 3.2); win = vec2(1.7, 1.7); sill = 0.9; }
          else if (style > 2.5 && style < 3.5) { cell = vec2(2.4, 3.1); win = vec2(1.15, 1.7); sill = 0.75; }
          else if (style > 3.5) { cell = vec2(3.6, 2.9); win = vec2(1.3, 1.3); sill = 1.0; }
          float groundH = (style > 1.5 && style < 2.5) || (style < 0.5) ? 4.2 : 0.0;
          float edge = style > 0.5 && style < 1.5 ? 0.3 : 0.9;
          float usable = max(W - edge * 2.0, 0.0);
          float ncols = max(floor(usable / cell.x), 1.0);
          float off = (W - ncols * cell.x) * 0.5;
          float u = uvm.x - off;
          float v = uvm.y - groundH;
          vec2 id = floor(vec2(u, v) / cell);
          vec2 f = vec2(u, v) - id * cell;
          float inCols = step(0.0, u) * step(u, ncols * cell.x);
          float inRows = step(0.0, v) * step(v, H - groundH - 1.2);
          vec2 wlo = vec2((cell.x - win.x) * 0.5, sill);
          vec2 whi = wlo + win;
          float inWin = step(wlo.x, f.x) * step(f.x, whi.x) * step(wlo.y, f.y) * step(f.y, whi.y) * inCols * inRows;
          // moldura
          float frameW = 0.07;
          float inFrame = step(wlo.x - frameW, f.x) * step(f.x, whi.x + frameW) * step(wlo.y - frameW, f.y) * step(f.y, whi.y + frameW) * inCols * inRows;
          // faixa entre andares (art déco e residencial)
          if (style > 2.5 && style < 3.5) {
            float band = step(fract(uvm.y / cell.y), 0.07);
            F.albedo = mix(F.albedo, F.albedo * 1.18, band);
          }
          if (style > 0.5 && style < 1.5) {
            // pele de vidro: tudo vidro com montantes
            F.albedo = mix(baseCol * 0.25, baseCol * 0.6, inWin);
            F.metal = mix(0.6, 0.0, inWin);
            F.rough = mix(0.35, 0.06, inWin);
          } else {
            F.albedo = mix(F.albedo, vec3(0.06, 0.06, 0.065), inFrame * (1.0 - inWin));
          }
          // térreo: lojas
          float shop = 0.0;
          if (groundH > 0.0 && uvm.y < groundH && uvm.y > 0.25) {
            float sc = 5.5; float su = mod(uvm.x - 0.6, sc);
            shop = step(0.6, su) * step(su, sc - 0.5) * step(0.3, uvm.y) * step(uvm.y, groundH - 1.1) * step(0.9, uvm.x) * step(uvm.x, W - 0.9);
            float sign = step(groundH - 1.0, uvm.y) * step(uvm.y, groundH - 0.35) * step(0.8, uvm.x) * step(uvm.x, W - 0.8);
            vec3 signC = 0.5 + 0.5 * cos(6.2831 * (fhash(vec2(floor((uvm.x - 0.6) / sc), seed)) + vec3(0.0, 0.33, 0.67)));
            F.albedo = mix(F.albedo, signC * 0.6, sign * 0.85);
            F.emit += signC * sign * uNight * 2.2;
          }
          float glass = max(inWin, shop);
          if (glass > 0.5) {
            // raio de visão em espaço da parede
            vec3 N = normalize(vWNormal);
            vec3 B = vec3(0.0, 1.0, 0.0);
            vec3 T = normalize(cross(B, N));
            vec3 rd = vec3(dot(-V, T), dot(-V, B), dot(-V, N));
            rd.z = min(rd.z, -0.05);
            vec2 cid = shop > 0.5 ? vec2(floor((uvm.x - 0.6) / 5.5), -1.0) : id;
            float rs = fhash(cid + seed * 17.0);
            float lit = step(0.55, fhash(cid * 1.37 + seed * 5.0 + 0.3)) * uNight + shop * uNight;
            vec2 fl = shop > 0.5 ? vec2(fract((uvm.x - 0.6) / 5.5), (uvm.y - 0.3) / (groundH - 1.4)) : (f - wlo) / win;
            vec3 room = interior(fl, normalize(vec3(rd.x / (shop > 0.5 ? 5.0 : win.x), rd.y / (shop > 0.5 ? 2.8 : win.y), rd.z)), rs, lit, depth / (shop > 0.5 ? 5.0 : win.x));
            // cortina/persiana em algumas janelas
            float blind = step(0.78, fhash(cid + seed)) * step(fl.y, 1.0) * step(1.0 - fl.y, 0.45 + 0.4 * fhash(cid * 3.1));
            room = mix(room, vec3(0.7, 0.66, 0.58) * mix(0.12, 0.9, lit), blind);
            vec3 tintGlass = style > 0.5 && style < 1.5 ? baseCol : vec3(0.55, 0.62, 0.68);
            F.albedo = mix(F.albedo, tintGlass * 0.05, 1.0);
            F.rough = style > 0.5 && style < 1.5 ? 0.05 : 0.08;
            F.metal = style > 0.5 && style < 1.5 ? 0.55 : 0.0;
            F.emit += room * (0.22 * (1.0 - uNight) + 1.6 * lit);
          }
          // néon art déco no topo
          if (style > 2.5 && style < 3.5) {
            float neon = step(H - 0.9, uvm.y) * step(uvm.y, H - 0.65);
            vec3 nc = fhash(vec2(seed, 2.0)) > 0.5 ? vec3(1.0, 0.18, 0.6) : vec3(0.1, 0.9, 1.0);
            F.albedo = mix(F.albedo, nc * 0.5, neon);
            F.emit += nc * neon * (0.4 + uNight * 3.5);
          }
          // escurecimento nos cantos (oclusão)
          float corner = smoothstep(0.0, 0.8, min(uvm.x, W - uvm.x));
          F.albedo *= mix(0.75, 1.0, corner);
          return F;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        Fac FAC = facade(diffuseColor.rgb, normalize(vViewPosition));
        diffuseColor.rgb = FAC.albedo;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = FAC.rough;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = FAC.metal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += FAC.emit;`);
    // vViewPosition está em espaço de visão; convertemos V para mundo no fragment
    shader.fragmentShader = shader.fragmentShader.replace('Fac FAC = facade(diffuseColor.rgb, normalize(vViewPosition));',
      'Fac FAC = facade(diffuseColor.rgb, normalize((vec4(vViewPosition, 0.0) * viewMatrix).xyz));');
  };
  m.customProgramCacheKey = () => 'facade-v1';
  return m;
}

// Construtor de geometria de prédios (acumula e gera BufferGeometry)
export class FacadeBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.fac = []; this.idx = []; this.v = 0; }

  quad(p0, p1, p2, p3, n, uv0, uv1, color, fac) {
    // p0..p3 no sentido anti-horário visto de fora
    const b = this.v;
    for (const p of [p0, p1, p2, p3]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(color.r, color.g, color.b); this.fac.push(fac[0], fac[1], fac[2], fac[3]); }
    this.uv.push(uv0[0], uv0[1], uv1[0], uv0[1], uv1[0], uv1[1], uv0[0], uv1[1]);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.v += 4;
  }

  // caixa alinhada aos eixos: x0..x1, z0..z1, y0..y1
  box(x0, x1, z0, z1, y0, y1, color, style, seed, opts = {}) {
    const H = y1 - y0;
    const roofStyle = opts.roofStyle !== undefined ? opts.roofStyle : -1;
    const wx = x1 - x0, wz = z1 - z0;
    const v0 = opts.vOffset || 0;
    // +z
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [0, v0], [wx, v0 + H], color, [style, seed, H + v0, wx]);
    // -z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [0, v0], [wx, v0 + H], color, [style, seed + 0.1, H + v0, wx]);
    // +x
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [0, v0], [wz, v0 + H], color, [style, seed + 0.2, H + v0, wz]);
    // -x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [0, v0], [wz, v0 + H], color, [style, seed + 0.3, H + v0, wz]);
    if (!opts.noTop) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0, z1], [x1, z0], color, [roofStyle, seed, H, wx]);
    if (opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [0, 0], [wx, wz], color, [-2, seed, H, wx]);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFac', new THREE.Float32BufferAttribute(this.fac, 4));
    g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
