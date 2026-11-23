// Renderizador: WebGL2 + pós-processamento (AO, bloom, SMAA, motion blur, color grading)
// com presets de qualidade e resolução dinâmica para manter o FPS alvo.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, ToneMappingEffect,
  ToneMappingMode, VignetteEffect, Effect, EffectAttribute, BlendFunction,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

export const QUALITY = {
  baixo: { label: 'Baixo', scale: 0.7, maxDpr: 1, shadows: 1024, shadowDist: 45, ao: null, bloom: true, smaa: false, mblur: false, aniso: 2, drawDist: 420, detail: 0.45, envRes: 64, reflections: false },
  medio: { label: 'Médio', scale: 0.85, maxDpr: 1, shadows: 2048, shadowDist: 60, ao: 'Performance', bloom: true, smaa: true, mblur: false, aniso: 4, drawDist: 620, detail: 0.7, envRes: 128, reflections: false },
  alto: { label: 'Alto', scale: 1.0, maxDpr: 1.25, shadows: 2048, shadowDist: 75, ao: 'Low', bloom: true, smaa: true, mblur: true, aniso: 8, drawDist: 820, detail: 0.9, envRes: 128, reflections: true },
  ultra: { label: 'Ultra', scale: 1.0, maxDpr: 2, shadows: 4096, shadowDist: 95, ao: 'Medium', bloom: true, smaa: true, mblur: true, aniso: 16, drawDist: 1100, detail: 1.0, envRes: 256, reflections: true },
};

// ---------------------------------------------------------------------------
// Efeito de color grading (estilo cinematográfico: sombras frias, altas quentes)
// ---------------------------------------------------------------------------
class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', /* glsl */`
      uniform float uSaturation;
      uniform float uContrast;
      uniform vec3 uShadowTint;
      uniform vec3 uHighlightTint;
      uniform float uTintAmount;
      uniform float uExposure;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * uExposure;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSaturation);
        c = (c - 0.5) * uContrast + 0.5;
        float lt = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
        vec3 tint = mix(uShadowTint, uHighlightTint, smoothstep(0.05, 0.75, lt));
        c = mix(c, c * tint * 1.0, uTintAmount);
        outputColor = vec4(max(c, 0.0), inputColor.a);
      }`, {
      uniforms: new Map([
        ['uSaturation', new THREE.Uniform(1.2)],
        ['uContrast', new THREE.Uniform(1.13)],
        ['uShadowTint', new THREE.Uniform(new THREE.Color(0.86, 0.95, 1.08))],
        ['uHighlightTint', new THREE.Uniform(new THREE.Color(1.07, 1.0, 0.9))],
        ['uTintAmount', new THREE.Uniform(0.55)],
        ['uExposure', new THREE.Uniform(1.0)],
      ]),
    });
  }
}

// ---------------------------------------------------------------------------
// Motion blur por reprojeção de câmera (ignora objetos próximos: moto e piloto)
// ---------------------------------------------------------------------------
class CameraMotionBlurEffect extends Effect {
  constructor() {
    super('CameraMotionBlurEffect', /* glsl */`
      uniform mat4 uInvProj;
      uniform mat4 uInvView;
      uniform mat4 uPrevViewProj;
      uniform float uStrength;
      uniform float uNear;
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        if (uStrength < 0.001 || depth >= 1.0) { outputColor = inputColor; return; }
        vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 view = uInvProj * clip; view /= view.w;
        float dist = -view.z;
        float mask = smoothstep(uNear, uNear * 2.5, dist);
        vec4 world = uInvView * view;
        vec4 prev = uPrevViewProj * world;
        vec2 puv = (prev.xy / prev.w) * 0.5 + 0.5;
        vec2 vel = (uv - puv) * uStrength * mask;
        float len = length(vel);
        if (len > 0.035) vel *= 0.035 / len;
        vec4 acc = inputColor;
        float wsum = 1.0;
        for (int i = 1; i <= 8; i++) {
          float t = float(i) / 8.0 - 0.5;
          vec2 suv = clamp(uv + vel * t, vec2(0.001), vec2(0.999));
          acc += texture2D(inputBuffer, suv);
          wsum += 1.0;
        }
        outputColor = acc / wsum;
      }`, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['uInvProj', new THREE.Uniform(new THREE.Matrix4())],
        ['uInvView', new THREE.Uniform(new THREE.Matrix4())],
        ['uPrevViewProj', new THREE.Uniform(new THREE.Matrix4())],
        ['uStrength', new THREE.Uniform(0.0)],
        ['uNear', new THREE.Uniform(4.0)],
      ]),
    });
    this._vp = new THREE.Matrix4();
    this._first = true;
  }
  updateCamera(camera, strength) {
    const u = this.uniforms;
    u.get('uInvProj').value.copy(camera.projectionMatrixInverse);
    u.get('uInvView').value.copy(camera.matrixWorld);
    if (this._first) { this._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this._first = false; }
    u.get('uPrevViewProj').value.copy(this._vp);
    u.get('uStrength').value = strength;
    this._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({
      canvas, antialias: false, stencil: false, depth: true, powerPreference: 'high-performance',
      logarithmicDepthBuffer: false,
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;
    this.r = r;
    this.quality = QUALITY.alto;
    this.qualityKey = 'alto';
    this.dynamicRes = true;
    this.targetFps = 240;
    this.resScale = 1;
    this._ftEma = 1000 / 60;
    this._resTimer = 0;
    this.motionBlurAmount = 1;
    this.composer = null;
  }

  setup(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.buildComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildComposer() {
    const q = this.quality;
    if (this.composer) this.composer.dispose();
    const c = new EffectComposer(this.r, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    c.addPass(new RenderPass(this.scene, this.camera));
    this.ao = null;
    if (q.ao) {
      const ao = new N8AOPostPass(this.scene, this.camera, 1, 1);
      ao.configuration.aoRadius = 2.2;
      ao.configuration.distanceFalloff = 0.6;
      ao.configuration.intensity = 2.4;
      ao.configuration.halfRes = q.ao !== 'Medium';
      ao.configuration.depthAwareUpsampling = true;
      ao.configuration.gammaCorrection = false;
      ao.configuration.color = new THREE.Color(0, 0, 0);
      ao.setQualityMode(q.ao);
      c.addPass(ao);
      this.ao = ao;
    }
    const effects = [];
    this.mblur = null;
    if (q.mblur) { this.mblur = new CameraMotionBlurEffect(); effects.push(this.mblur); }
    this.bloom = new BloomEffect({ mipmapBlur: true, intensity: 0.7, luminanceThreshold: 1.05, luminanceSmoothing: 0.3, radius: 0.75, levels: 7 });
    if (q.bloom) effects.push(this.bloom);
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    effects.push(this.tone);
    this.grade = new GradeEffect();
    effects.push(this.grade);
    effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.42 }));
    if (q.smaa) effects.push(new SMAAEffect({ preset: SMAAPreset.HIGH }));
    // EffectPass mescla os efeitos compatíveis em um único shader
    const convolution = this.mblur ? [this.mblur] : [];
    if (convolution.length) c.addPass(new EffectPass(this.camera, ...convolution));
    c.addPass(new EffectPass(this.camera, ...effects.filter((e) => !convolution.includes(e))));
    this.composer = c;
  }

  setQuality(key) {
    this.qualityKey = key;
    this.quality = QUALITY[key];
    this.resScale = 1;
    if (this.scene) { this.buildComposer(); this.resize(); }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.maxDpr) * this.quality.scale * this.resScale;
    this.r.setPixelRatio(dpr);
    this.r.setSize(w, h, false);
    if (this.composer) this.composer.setSize(w, h, false);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  // Ajusta a escala de resolução para segurar o FPS alvo
  adapt(dtMs) {
    this._ftEma = this._ftEma * 0.95 + dtMs * 0.05;
    if (!this.dynamicRes) return;
    this._resTimer += dtMs;
    if (this._resTimer < 1500) return;
    this._resTimer = 0;
    const budget = 1000 / this.targetFps;
    let s = this.resScale;
    if (this._ftEma > budget * 1.12 && s > 0.55) s = Math.max(0.55, s - 0.08);
    else if (this._ftEma < budget * 0.8 && s < 1) s = Math.min(1, s + 0.05);
    if (s !== this.resScale) { this.resScale = s; this.resize(); }
  }

  render(dt, speedBlur) {
    this.r.info.reset();
    // obturador de ~1/120 s: normaliza pelo tempo do quadro
    const shutter = Math.min(1, (1 / 120) / Math.max(dt, 1 / 1000));
    if (this.mblur) this.mblur.updateCamera(this.camera, speedBlur * this.motionBlurAmount * shutter);
    this.composer.render(dt);
  }
}
