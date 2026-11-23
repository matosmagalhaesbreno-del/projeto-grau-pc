// Texturas PBR procedurais geradas na GPU (albedo, normal e rugosidade), emendáveis (tileable).
import * as THREE from 'three';

const NOISE = /* glsl */`
// Ruídos periódicos: uv em [0,1) escalado por frequência inteira F tem período F.
float hashP(vec2 p, float per){ p = mod(p, per); vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash2P(vec2 p, float per){ p = mod(p, per); vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 uv, float F){ vec2 p = uv * F; vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hashP(i, F), hashP(i+vec2(1,0), F), u.x), mix(hashP(i+vec2(0,1), F), hashP(i+vec2(1,1), F), u.x), u.y); }
float fbm(vec2 uv, float F, int oct){ float a = 0.5, s = 0.0;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a * vnoise(uv, F); F *= 2.0; a *= 0.5; }
  return s; }
vec2 voronoi(vec2 uv, float F){ vec2 p = uv * F; vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; float id = 0.0;
  for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++){ vec2 g = vec2(x,y); vec2 o = hash2P(i+g, F); vec2 r = g + o - f; float d = dot(r,r);
    if (d < d1){ d2 = d1; d1 = d; id = hashP(i+g, F); } else if (d < d2) d2 = d; }
  return vec2(sqrt(d2) - sqrt(d1), id); }
`;

// Cada superfície define: float H(uv), vec3 A(uv) (linear), float R(uv). uv em [0,1)
const SURFACES = {
  asphalt: /* glsl */`
    float H(vec2 uv){ float g = vnoise(uv, 256.0) * 0.5 + vnoise(uv, 512.0) * 0.35; float big = fbm(uv, 8.0, 4);
      return g * 0.6 + big * 0.4 - smoothstep(0.62, 0.75, fbm(uv + 0.37, 16.0, 4)) * 0.3; }
    vec3 A(vec2 uv){ float n = fbm(uv, 8.0, 5); float s = vnoise(uv, 384.0);
      vec3 c = mix(vec3(0.045, 0.047, 0.05), vec3(0.085, 0.084, 0.082), n);
      c += step(0.8, s) * 0.045 * vec3(1.0, 0.98, 0.95);
      c = mix(c, c * 0.65, smoothstep(0.6, 0.8, fbm(uv + 0.71, 4.0, 4)) * 0.6);
      return c; }
    float R(vec2 uv){ return mix(0.78, 0.95, fbm(uv, 16.0, 4)) - smoothstep(0.65, 0.8, fbm(uv + 0.71, 4.0, 4)) * 0.22; }`,
  concrete: /* glsl */`
    vec2 tileCell(vec2 uv){ return floor(uv * 8.0); }
    float grout(vec2 uv){ vec2 f = fract(uv * 8.0); vec2 d = min(f, 1.0 - f); return smoothstep(0.0, 0.03, min(d.x, d.y)); }
    float H(vec2 uv){ float t = hashP(tileCell(uv), 8.0); return grout(uv) * (0.8 + 0.2 * t) + fbm(uv, 32.0, 3) * 0.15; }
    vec3 A(vec2 uv){ float t = hashP(tileCell(uv), 8.0); float n = fbm(uv, 16.0, 5);
      vec3 c = mix(vec3(0.22, 0.21, 0.195), vec3(0.34, 0.33, 0.31), t * 0.6 + n * 0.4);
      c = mix(vec3(0.16, 0.16, 0.15), c, grout(uv));
      c *= 1.0 - smoothstep(0.55, 0.8, fbm(uv + 0.13, 4.0, 4)) * 0.35;
      return c; }
    float R(vec2 uv){ return mix(0.95, 0.7 + 0.2 * hashP(tileCell(uv), 8.0), grout(uv)); }`,
  wave: /* glsl */`
    float pat(vec2 uv){ float y = uv.y * 2.0 + 0.16 * sin(uv.x * 6.2831853 * 2.0); return step(0.5, fract(y)); }
    float H(vec2 uv){ vec2 v = voronoi(uv, 96.0); return smoothstep(0.0, 0.12, v.x); }
    vec3 A(vec2 uv){ vec2 v = voronoi(uv, 96.0); float w = pat(uv);
      vec3 stone = mix(vec3(0.03, 0.03, 0.033), vec3(0.62, 0.60, 0.56), w) * (0.85 + 0.3 * v.y);
      return mix(vec3(0.12, 0.11, 0.10), stone, smoothstep(0.0, 0.09, v.x)); }
    float R(vec2 uv){ vec2 v = voronoi(uv, 96.0); return mix(0.9, 0.55 + 0.2 * v.y, smoothstep(0.0, 0.1, v.x)); }`,
  sand: /* glsl */`
    float H(vec2 uv){ float rip = sin((uv.x + fbm(uv, 4.0, 3) * 0.25) * 6.2831853 * 24.0) * 0.5 + 0.5; return rip * 0.35 + fbm(uv, 32.0, 4) * 0.65; }
    vec3 A(vec2 uv){ float n = fbm(uv, 16.0, 5); float g = vnoise(uv, 512.0);
      vec3 c = mix(vec3(0.34, 0.27, 0.18), vec3(0.46, 0.38, 0.27), n);
      return c * (0.92 + 0.16 * g); }
    float R(vec2 uv){ return 0.93; }`,
  grass: /* glsl */`
    float H(vec2 uv){ return fbm(uv, 64.0, 4); }
    vec3 A(vec2 uv){ float n = fbm(uv, 8.0, 5); float b = vnoise(uv, 256.0);
      vec3 c = mix(vec3(0.05, 0.10, 0.025), vec3(0.13, 0.20, 0.055), n);
      c = mix(c, vec3(0.2, 0.18, 0.1), smoothstep(0.62, 0.8, fbm(uv + 0.5, 4.0, 4)) * 0.7);
      return c * (0.8 + 0.4 * b); }
    float R(vec2 uv){ return 0.9; }`,
  gravel: /* glsl */`
    float H(vec2 uv){ vec2 v = voronoi(uv, 64.0); return smoothstep(0.0, 0.3, v.x); }
    vec3 A(vec2 uv){ vec2 v = voronoi(uv, 64.0); return mix(vec3(0.16, 0.16, 0.16), vec3(0.36, 0.35, 0.33) * (0.8 + 0.4 * v.y), smoothstep(0.0, 0.2, v.x)); }
    float R(vec2 uv){ return 0.9; }`,
};

export class TextureFactory {
  constructor(renderer, size = 1024) {
    this.r = renderer;
    this.size = size;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.cache = {};
  }

  _rt(srgb) {
    const rt = new THREE.WebGLRenderTarget(this.size, this.size, {
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false,
      colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    });
    rt.texture.anisotropy = this.r.capabilities.getMaxAnisotropy();
    return rt;
  }

  surface(name, normalStrength = 2.0) {
    if (this.cache[name]) return this.cache[name];
    const body = SURFACES[name];
    const out = {};
    for (const mode of ['albedo', 'normal', 'rough']) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTexel: { value: 1 / this.size }, uStrength: { value: normalStrength } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: /* glsl */`
          precision highp float;
          varying vec2 vUv; uniform float uTexel; uniform float uStrength;
          ${NOISE}
          ${body}
          void main(){
            vec2 uv = vUv;
            #if MODE == 0
              gl_FragColor = vec4(A(uv), 1.0);
            #elif MODE == 1
              float h = H(uv), hx = H(uv + vec2(uTexel, 0.0)), hy = H(uv + vec2(0.0, uTexel));
              vec3 n = normalize(vec3((h - hx) * uStrength, (h - hy) * uStrength, 1.0));
              gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
            #else
              gl_FragColor = vec4(1.0, clamp(R(uv), 0.0, 1.0), 0.0, 1.0);
            #endif
          }`,
        defines: { MODE: mode === 'albedo' ? 0 : mode === 'normal' ? 1 : 2 },
        depthTest: false, depthWrite: false,
      });
      this.quad.material = mat;
      const rt = this._rt(mode === 'albedo');
      this.r.setRenderTarget(rt);
      this.r.render(this.scene, this.cam);
      this.r.setRenderTarget(null);
      mat.dispose();
      out[mode] = rt.texture;
    }
    this.cache[name] = out;
    return out;
  }

  // Material com as texturas da superfície; a repetição vem das UVs da geometria (em metros / tamanho do ladrilho)
  material(name, opts = {}) {
    const t = this.surface(name, opts.normalStrength || 2.0);
    return new THREE.MeshStandardMaterial({
      map: t.albedo, normalMap: t.normal, roughnessMap: t.rough, metalness: 0, roughness: opts.roughness || 1,
      normalScale: new THREE.Vector2(opts.normalScale || 1, opts.normalScale || 1),
      color: opts.color || 0xffffff,
    });
  }
}
