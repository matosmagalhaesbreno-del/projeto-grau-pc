// Atmosfera: céu físico (Preetham) com nuvens, sol/lua por horário, neblina de altura com
// espalhamento na direção do sol (aplicada a todos os materiais) e mapa de ambiente (IBL).
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// Uniforms globais compartilhados por todos os materiais (injetados via onBeforeCompile)
export const GLOBAL = {
  uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uFogSunColor: { value: new THREE.Color(1, 0.8, 0.6) },
  uFogHeight: { value: new THREE.Vector2(0, 0.012) },
  uTime: { value: 0 },
  uNight: { value: 0 },
  uWet: { value: 0 },
};

// Neblina analítica de altura (substitui os chunks padrão do three)
THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying vec3 vFogOffset;
#endif`;
THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogOffset = transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif`;
THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform vec3 uFogSunDir;
  uniform vec3 uFogSunColor;
  uniform vec2 uFogHeight;
  varying vec3 vFogOffset;
#endif`;
THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  {
    float fDist = length(vFogOffset);
    vec3 fDir = vFogOffset / max(fDist, 1e-4);
    float camY = cameraPosition.y - uFogHeight.x;
    float b = uFogHeight.y;
    float k = fDir.y * b;
    float fAmt = fogDensity * exp(-b * camY) * (abs(k) > 1e-4 ? (1.0 - exp(-fDist * k)) / k : fDist);
    fAmt = 1.0 - exp(-max(fAmt, 0.0));
    float sunAmt = pow(max(dot(fDir, uFogSunDir), 0.0), 10.0) * 0.8;
    vec3 fCol = mix(fogColor, uFogSunColor, sunAmt);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fCol, fAmt);
  }
#endif`;

const _defaultOBC = THREE.Material.prototype.onBeforeCompile;
export function injectGlobals(shader) {
  shader.uniforms.uFogSunDir = GLOBAL.uFogSunDir;
  shader.uniforms.uFogSunColor = GLOBAL.uFogSunColor;
  shader.uniforms.uFogHeight = GLOBAL.uFogHeight;
}
THREE.Material.prototype.onBeforeCompile = function (shader) {
  injectGlobals(shader);
  if (_defaultOBC) _defaultOBC.call(this, shader);
};

// céu noturno: o modelo de Preetham fica preto à noite; somamos um gradiente azulado
Sky.SkyShader.uniforms.uNightSky = { value: 0 };
Sky.SkyShader.fragmentShader = Sky.SkyShader.fragmentShader
  .replace('uniform float showSunDisc;', 'uniform float showSunDisc;\nuniform float uNightSky;')
  .replace('gl_FragColor = vec4( texColor, 1.0 );', `{
      vec3 dirN = normalize( vWorldPosition - cameraPosition );
      float hz = clamp( dirN.y, 0.0, 1.0 );
      vec3 nightC = mix( vec3( 0.020, 0.032, 0.070 ), vec3( 0.003, 0.006, 0.018 ), pow( hz, 0.45 ) );
      texColor += nightC * uNightSky;
    }
    gl_FragColor = vec4( texColor, 1.0 );`);

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Atmosphere {
  constructor(renderer, scene) {
    this.r = renderer;
    this.scene = scene;
    this.hour = 17.6;
    this.timeScale = 0; // horas de jogo por segundo real (0 = parado)
    this.clouds = 0.35;
    this.envDirty = true;
    this._envTimer = 0;
    this._lastEnvHour = -10;

    const sky = new Sky();
    sky.scale.setScalar(9000);
    sky.frustumCulled = false;
    const u = sky.material.uniforms;
    u.turbidity.value = 4.5;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.86;
    if (u.cloudCoverage) {
      u.cloudCoverage.value = this.clouds;
      u.cloudScale.value = 0.00022;
      u.cloudSpeed.value = 0.00006;
      u.cloudDensity.value = 0.55;
      u.cloudElevation.value = 0.5;
    }
    this.sky = sky;
    scene.add(sky);

    // Estrelas (noite)
    const starGeo = new THREE.BufferGeometry();
    const N = 2500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2, y = Math.random() * 0.95 + 0.05;
      const rr = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * rr * 4000, y * 4000, Math.sin(th) * rr * 4000], i * 3);
      const b = 0.4 + Math.random() * 0.6;
      col.set([b, b, b * (0.9 + Math.random() * 0.2)], i * 3);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // Lua
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false, transparent: true }));
    scene.add(this.moon);

    // Luzes
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a332a, 0.15);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xbfd0e0, 0.0016);

    // Cena separada para gerar o mapa de ambiente (céu + chão escuro)
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(900);
    this.envScene.add(this.envSky);
    const g = new THREE.Mesh(new THREE.CircleGeometry(400, 32), new THREE.MeshBasicMaterial({ color: 0x2a2826 }));
    g.rotation.x = -Math.PI / 2; g.position.y = -2;
    this.envGround = g;
    this.envScene.add(g);
    // "silhueta" de prédios para reflexos mais críveis
    const bmat = new THREE.MeshBasicMaterial({ color: 0x3b3d44 });
    this.envBuildingMat = bmat;
    for (let i = 0; i < 26; i++) {
      const h = 20 + Math.random() * 70, a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(30 + Math.random() * 30, h, 30), bmat);
      m.position.set(Math.cos(a) * 160, h / 2 - 2, Math.sin(a) * 160);
      m.lookAt(0, h / 2, 0);
      if (Math.cos(a) < 0.3) this.envScene.add(m); // oceano a leste: sem prédios
    }
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;

    this.sunDir = new THREE.Vector3();
    this.state = { day: 1, night: 0, golden: 0 };
    this.shadowDist = 75;
    this.update(0, new THREE.Vector3());
  }

  setShadowQuality(size, dist) {
    const s = this.sun.shadow;
    if (s.map) { s.map.dispose(); s.map = null; }
    s.mapSize.set(size, size);
    this.shadowDist = dist;
    const c = s.camera;
    c.left = -dist; c.right = dist; c.top = dist; c.bottom = -dist; c.near = 1; c.far = 600;
    c.updateProjectionMatrix();
  }

  sunPosition(hour) {
    // Nasce a leste (+x, sobre o mar), passa ao norte (hemisfério sul), põe-se a oeste
    const t = (hour - 6) / 12; // 0 = nascer, 1 = pôr
    const ang = t * Math.PI;
    const elev = Math.sin(ang) * 1.12 - 0.04;
    const dir = new THREE.Vector3(Math.cos(ang), Math.max(-1, elev), -0.42 * Math.sin(ang) - 0.12).normalize();
    return dir;
  }

  update(dt, focus) {
    if (this.timeScale) { this.hour = (this.hour + dt * this.timeScale) % 24; }
    const h = this.hour;
    const sd = this.sunPosition(h);
    this.sunDir.copy(sd);
    const elev = sd.y;
    const day = smooth(-0.12, 0.12, elev);
    const night = 1 - smooth(-0.22, 0.0, elev);
    const golden = smooth(-0.05, 0.06, elev) * (1 - smooth(0.12, 0.35, elev));
    this.state.day = day; this.state.night = night; this.state.golden = golden;
    GLOBAL.uNight.value = night;

    for (const s of [this.sky, this.envSky]) {
      const u = s.material.uniforms;
      u.sunPosition.value.copy(sd);
      u.rayleigh.value = lerp(2.6, 1.4, smooth(0.0, 0.5, elev));
      u.turbidity.value = lerp(7.5, 4.0, smooth(0.0, 0.6, elev));
      if (u.cloudCoverage) u.cloudCoverage.value = this.clouds;
      if (u.time) u.time.value += dt;
      if (u.uNightSky) u.uNightSky.value = night;
    }
    this.envSky.material.uniforms.showSunDisc && (this.envSky.material.uniforms.showSunDisc.value = 0);

    // Luz do sol: branca ao meio-dia, laranja no fim de tarde; lua azulada à noite
    const sunCol = new THREE.Color().setRGB(1.0, lerp(0.55, 0.96, smooth(0.0, 0.45, elev)), lerp(0.28, 0.9, smooth(0.0, 0.5, elev)));
    const moonDir = sd.clone().multiplyScalar(-1);
    if (elev > -0.08) {
      this.sun.color.copy(sunCol);
      this.sun.intensity = 4.2 * smooth(-0.06, 0.12, elev);
      this.lightDir = sd;
    } else {
      this.sun.color.setRGB(0.55, 0.65, 1.0);
      this.sun.intensity = 0.45 * night;
      this.lightDir = moonDir.y > 0.1 ? moonDir : new THREE.Vector3(0.3, 0.8, 0.2).normalize();
    }
    this.hemi.intensity = lerp(0.35, 0.1, day);
    this.hemi.color.setRGB(lerp(0.25, 0.75, day), lerp(0.32, 0.85, day), lerp(0.6, 1.0, day));

    // Neblina
    const fog = this.scene.fog;
    const dayFog = new THREE.Color(0.68, 0.78, 0.9);
    const goldFog = new THREE.Color(0.95, 0.62, 0.45);
    const nightFog = new THREE.Color(0.018, 0.026, 0.05);
    const fc = dayFog.clone().lerp(goldFog, golden * 0.8).lerp(nightFog, night);
    fog.color.copy(fc);
    fog.density = lerp(0.00055, 0.00085, golden) * lerp(1, 1.3, night);
    GLOBAL.uFogSunDir.value.copy(sd);
    GLOBAL.uFogSunColor.value.setRGB(1.0, lerp(0.6, 0.85, day), lerp(0.35, 0.7, day)).multiplyScalar(lerp(0.3, 0.85, day)).lerp(fc, night);
    GLOBAL.uFogHeight.value.set(0, 0.011);

    this.starMat.opacity = night * 0.9;
    this.moon.position.copy(moonDir).multiplyScalar(3500);
    this.moon.material.opacity = smooth(0.0, 0.2, moonDir.y);
    this.moon.visible = moonDir.y > -0.05;

    // sombra seguindo o foco, com snapping por texel (evita tremulação)
    const L = this.lightDir.clone().normalize();
    const ld = 260;
    const s = this.sun.shadow;
    const texel = (2 * this.shadowDist) / s.mapSize.x;
    const center = focus.clone();
    // snap no espaço da luz
    const lm = new THREE.Matrix4().lookAt(new THREE.Vector3(), L.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = lm.clone().invert();
    const lc = center.clone().applyMatrix4(inv);
    lc.x = Math.round(lc.x / texel) * texel;
    lc.y = Math.round(lc.y / texel) * texel;
    center.copy(lc.applyMatrix4(lm));
    this.sun.position.copy(center).addScaledVector(L, ld);
    this.sun.target.position.copy(center);
    this.sun.target.updateMatrixWorld();

    this.scene.environmentIntensity = lerp(0.35, 0.75, day) + golden * 0.35;
    this.scene.backgroundIntensity = 1;

    // regenerar o mapa de ambiente quando o horário muda o suficiente
    this._envTimer -= dt;
    if (this.envDirty || (Math.abs(this.hour - this._lastEnvHour) > 0.08 && this._envTimer <= 0)) {
      this.regenEnv();
    }
  }

  regenEnv() {
    this._envTimer = 1.5;
    this.envDirty = false;
    this._lastEnvHour = this.hour;
    const night = this.state.night;
    this.envGround.material.color.setRGB(0.16, 0.15, 0.14).multiplyScalar(1 - night * 0.85);
    this.envBuildingMat.color.setRGB(0.24, 0.25, 0.28).multiplyScalar(lerp(1, 0.25, night));
    const rt = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }
}
