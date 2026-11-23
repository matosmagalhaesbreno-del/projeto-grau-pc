// Grau Livre — ponto de entrada: carregamento, estados, laço principal.
import * as THREE from 'three';
import { Renderer, QUALITY } from './core/renderer.js';
import { Atmosphere, GLOBAL } from './world/atmosphere.js';
import { TextureFactory } from './world/textures.js';
import { City, SPAWN, SAND_X0 } from './world/city.js';
import { Props } from './world/props.js';
import { Traffic } from './world/traffic.js';
import { loadModel } from './core/assets.js';
import { Bike } from './vehicle/bike.js';
import { BikePhysics } from './vehicle/physics.js';
import { CameraRig } from './game/camera.js';
import { FX } from './game/fx.js';
import { Tricks } from './game/tricks.js';
import { BIKES, UPGRADES, upgradeCost, missionAt } from './game/data.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { UI } from './ui/ui.js';
import interRegular from '@pmndrs/assets/fonts/inter_regular.woff.js';
import interBold from '@pmndrs/assets/fonts/inter_bold.woff.js';
import interBlack from '@pmndrs/assets/fonts/inter_black.woff.js';
import interBlackItalic from '@pmndrs/assets/fonts/inter_black_italic.woff.js';
import interExtraBold from '@pmndrs/assets/fonts/inter_extra_bold.woff.js';

// ---------------------------------------------------------------------------
// Fonte embutida
const fontCss = document.createElement('style');
fontCss.textContent = [[interRegular, 400, 'normal'], [interBold, 700, 'normal'], [interExtraBold, 800, 'normal'], [interBlack, 900, 'normal'], [interBlackItalic, 900, 'italic']]
  .map(([src, w, s]) => `@font-face{font-family:"Inter";src:url(${src}) format("woff");font-weight:${w};font-style:${s};font-display:block}`).join('\n');
document.head.appendChild(fontCss);

// ---------------------------------------------------------------------------
// Save
const SAVE_KEY = 'grau-livre-v2';
const DEFAULT_SETTINGS = { quality: 'alto', fpsTarget: 240, dynamicRes: true, renderScale: 1, motionBlur: 0.8, showFps: false, hour: 17.4, timeScale: 0.01, clouds: 0.35, traffic: 70, assist: 1, autoGear: true, volume: 0.8 };
function defaultSave() {
  return { v: 2, money: 3000, owned: ['cg160'], current: 'cg160', bikes: {}, rider: { jacket: '#141820', helmet: '#f1f1f1' }, plate: 'GRA2U26', mission: 0, best: { time: 0, dist: 0, combo: 0 }, settings: { ...DEFAULT_SETTINGS } };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.v === 2) { const d = defaultSave(); return { ...d, ...s, settings: { ...d.settings, ...s.settings }, rider: { ...d.rider, ...s.rider }, best: { ...d.best, ...s.best } }; }
  } catch (e) { /* sem storage */ }
  return defaultSave();
}
let save = loadSave();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
const bikeSave = (key) => save.bikes[key] || (save.bikes[key] = { paint: null, rim: null, upgrades: {} });
const specOf = (key) => BIKES.find((b) => b.key === key);

// ---------------------------------------------------------------------------
const ui = new UI();
const canvas = document.getElementById('game');
const R = new Renderer(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.15, 5000);
const input = new Input();
const audio = new AudioEngine();
const tricks = new Tricks();
const rig = new CameraRig(camera);
let atmo, city, props, traffic, bike, phys, fx, models = {};
let state = 'loading', prevState = 'menu';
let crashTimer = 0, lastSafe = { ...SPAWN }, safeTimer = 0;
let mission = missionAt(save.mission), missionProgress = 0;
let garageSel = save.current, garageAngle = 0.9, previewKey = null;
let lightPhaseKey = '';
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot() {
  ui.show('loading');
  ui.loading(0.05, 'Iniciando o renderizador');
  const st = save.settings;
  R.setQuality(st.quality);
  R.targetFps = st.fpsTarget || 1000;
  R.dynamicRes = st.dynamicRes;
  R.motionBlurAmount = st.motionBlur;
  R.quality = { ...QUALITY[st.quality], scale: QUALITY[st.quality].scale * st.renderScale };
  atmo = new Atmosphere(R.r, scene);
  atmo.hour = st.hour; atmo.timeScale = st.timeScale; atmo.clouds = st.clouds;
  atmo.setShadowQuality(R.quality.shadows, R.quality.shadowDist);
  await nextFrame();
  ui.loading(0.15, 'Gerando texturas procedurais');
  const tex = new TextureFactory(R.r, R.quality.detail > 0.8 ? 1024 : 512);
  for (const s of ['asphalt', 'concrete', 'wave', 'sand', 'grass']) { tex.surface(s); }
  await nextFrame();
  ui.loading(0.3, 'Construindo a cidade');
  city = new City(scene, tex, R.quality);
  await nextFrame();
  ui.loading(0.45, 'Carregando modelos 3D');
  for (const n of ['palm', 'lamp', 'tlight', 'car_hatch', 'car_sedan', 'car_suv', 'car_pickup']) models[n] = await loadModel(n);
  ui.loading(0.6, 'Espalhando palmeiras, postes e semáforos');
  props = new Props(scene, city, models, R.quality);
  await nextFrame();
  ui.loading(0.7, 'Colocando o trânsito na rua');
  traffic = new Traffic(scene, city, models, st.traffic);
  ui.loading(0.8, 'Preparando a moto');
  bike = new Bike(scene);
  fx = new FX(scene);
  await setBike(save.current);
  R.setup(scene, camera);
  ui.loading(0.9, 'Compilando shaders');
  await nextFrame();
  try { R.r.compile(scene, camera); } catch (e) { /* ignore */ }
  ui.loading(1, 'Pronto');
  await nextFrame();
  if (window.desktop) {
    document.getElementById('quitBtn').classList.remove('hidden');
    try { save.settings.vsync = window.desktop.getConfig().vsync; } catch (e) { /* ignore */ }
  }
  goMenu();
  rig.pos.set(SPAWN.x + 3, 1.6, SPAWN.z + 3);
  input.onAny = () => audio.resume();
  requestAnimationFrame(loop);
}

async function setBike(key, preview = false) {
  const spec = specOf(key);
  const geo = await bike.load(key, true);
  const bs = bikeSave(key);
  if (bs.paint) bike.setPaint(bs.paint, bs.rim);
  else if (bs.rim) bike.setPaint(null, bs.rim);
  bike.setRiderColors(save.rider.jacket, save.rider.helmet);
  bike.setPlate(save.plate);
  if (!preview) {
    const x = phys ? phys.x : SPAWN.x, z = phys ? phys.z : SPAWN.z, h = phys ? phys.h : SPAWN.h;
    phys = new BikePhysics(spec, geo, bs.upgrades, { assist: save.settings.assist, autoGear: save.settings.autoGear });
    phys.reset(x, z, h);
    hookPhysics();
    audio.setEngine(spec.engine, spec.cyl);
  }
  return geo;
}

function hookPhysics() {
  phys.onCrash = (reason) => {
    crashTimer = 3.0;
    tricks.fail();
    ui.crash(reason);
    audio.thud(1);
    rig.shake = 1.2;
  };
  phys.onLand = (rate) => { tricks.landed(rate); if (rate > 1.5) { rig.shake = Math.min(0.8, rate * 0.15); audio.thud(0.25); } };
  phys.onTail = () => { rig.shake = 0.4; };
  phys.onBump = (s) => { rig.shake = Math.max(rig.shake, Math.min(0.6, s * 0.06)); };
  phys.onShift = () => audio.shift();
  phys.onClutchPop = () => audio.pop(0.8);
}

function respawn(toSpawn) {
  const p = toSpawn ? SPAWN : lastSafe;
  bike.endCrash();
  phys.reset(p.x, p.z, p.h);
  ui.crash(null);
  fx.breakSkid();
  tricks.combo = null;
  rig.snapNext = true;
}

// ---------------------------------------------------------------------------
// Estados
function goMenu() {
  state = 'menu';
  ui.setHud(false);
  ui.show('menu');
  respawn(true);
  document.getElementById('menuInfo').textContent = `R$ ${save.money.toLocaleString('pt-BR')} · ${specOf(save.current).brand} ${specOf(save.current).name} · missão ${save.mission + 1}`;
}
function goPlay() { state = 'play'; ui.show(null); ui.setHud(true); ui.resetHint(); audio.resume(); }
function goPause() { state = 'pause'; ui.show('pause'); }
function goGarage() {
  prevState = state === 'pause' ? 'pause' : 'menu';
  state = 'garage';
  garageSel = save.current;
  ui.setHud(false);
  ui.show('garage');
  renderGarage();
}
function goSettings() { prevState = state; state = 'settings'; ui.show('settings'); renderSettings(); }
function goControls() { prevState = state; state = 'controls'; ui.show('controls'); }
async function back() {
  if (state === 'garage') {
    if (previewKey && previewKey !== save.current) { await setBike(save.current); }
    previewKey = null;
    if (prevState === 'pause') { state = 'pause'; ui.show('pause'); } else goMenu();
  } else if (state === 'settings' || state === 'controls') {
    state = prevState; ui.show(prevState === 'pause' ? 'pause' : 'menu');
  }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  audio.resume();
  audio.chime(660, 0.06, 0.05);
  const a = b.dataset.act;
  if (a === 'play' || a === 'resume') goPlay();
  else if (a === 'garage') goGarage();
  else if (a === 'settings') goSettings();
  else if (a === 'controls') goControls();
  else if (a === 'back') back();
  else if (a === 'respawn') { respawn(true); goPlay(); }
  else if (a === 'menu') goMenu();
  else if (a === 'quit' && window.desktop) window.desktop.quit();
});

function renderGarage() {
  ui.renderGarage(save, garageSel, {
    select: async (k) => { garageSel = k; previewKey = k; await setBike(k, k !== save.current); renderGarage(); },
    buy: async (k) => {
      const b = specOf(k);
      if (save.money < b.price) return;
      save.money -= b.price; save.owned.push(k); save.current = k; persist();
      audio.chime(520, 0.3, 0.1);
      await setBike(k); previewKey = null; renderGarage();
    },
    use: async (k) => { save.current = k; persist(); await setBike(k); previewKey = null; renderGarage(); },
    upgrade: (k, id) => {
      const b = specOf(k), u = UPGRADES.find((x) => x.id === id), bs = bikeSave(k);
      const lvl = bs.upgrades[id] || 0, cost = upgradeCost(b, u, lvl);
      if (save.money < cost || lvl >= u.max) return;
      save.money -= cost; bs.upgrades[id] = lvl + 1; persist();
      audio.chime(700, 0.2, 0.08);
      if (k === save.current) phys.configure(bs.upgrades);
      renderGarage();
    },
    paint: (k, c) => { bikeSave(k).paint = c; persist(); bike.setPaint(c, bikeSave(k).rim); renderGarage(); },
    rim: (k, c) => { bikeSave(k).rim = c; persist(); bike.setPaint(bikeSave(k).paint, c); renderGarage(); },
    rider: (part, c) => { save.rider[part] = c; persist(); bike.setRiderColors(save.rider.jacket, save.rider.helmet); renderGarage(); },
    plate: (t) => { save.plate = t; persist(); bike.setPlate(t); renderGarage(); },
  });
}

function renderSettings() {
  ui.renderSettings(save.settings, {
    set: (k, v, live) => {
      save.settings[k] = v; persist();
      applySetting(k, v);
      if (!live) renderSettings();
    },
  });
}

function applySetting(k, v) {
  const st = save.settings;
  if (k === 'quality' || k === 'renderScale') {
    R.setQuality(st.quality);
    R.quality = { ...QUALITY[st.quality], scale: QUALITY[st.quality].scale * st.renderScale };
    R.resize();
    atmo.setShadowQuality(R.quality.shadows, R.quality.shadowDist);
  } else if (k === 'fpsTarget') R.targetFps = v || 1000;
  else if (k === 'dynamicRes') { R.dynamicRes = v; if (!v) { R.resScale = 1; R.resize(); } }
  else if (k === 'motionBlur') R.motionBlurAmount = v;
  else if (k === 'hour') { atmo.hour = v; atmo.envDirty = true; }
  else if (k === 'timeScale') atmo.timeScale = v;
  else if (k === 'clouds') { atmo.clouds = v; atmo.envDirty = true; }
  else if (k === 'assist') phys.assist = v;
  else if (k === 'autoGear') phys.autoGear = v;
  else if (k === 'volume') audio.setVolume(v);
  else if (k === 'vsync' && window.desktop) { window.desktop.setConfig({ vsync: v }); ui.feed('Reinicie o jogo para aplicar o VSync', 'info'); }
}

// ---------------------------------------------------------------------------
// Laço principal
const PHYS_DT = 1 / 240;
let acc = 0, last = performance.now(), fpsEma = 60, hudTimer = 0, lastRender = 0;
const tmpV = new THREE.Vector3(), tmpF = new THREE.Vector3();

function loop(now) {
  requestAnimationFrame(loop);
  const target = save.settings.fpsTarget;
  if (target > 0 && now - lastRender < 1000 / target - 0.6) return;
  const frameMs = now - lastRender;
  lastRender = now;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsEma = fpsEma * 0.95 + (1000 / Math.max(1, frameMs)) * 0.05;
  GLOBAL.uTime.value += dt;
  input.update(dt);
  handleKeys();

  const playing = state === 'play';
  const frozen = state === 'pause' || state === 'settings' && prevState === 'pause' || state === 'controls' && prevState === 'pause';
  const inp = playing ? input.state : { throttle: 0, frontBrake: 0, rearBrake: state === 'menu' || state === 'garage' ? 1 : 0, steer: 0, lean: 0, clutch: false };

  if (!frozen) {
    acc += dt;
    let steps = 0;
    while (acc >= PHYS_DT && steps < 12) {
      if (state === 'play' || state === 'menu' || state === 'garage') {
        phys.step(PHYS_DT, inp, city);
        if (playing) tricks.update(PHYS_DT, phys, { onBank });
      }
      acc -= PHYS_DT; steps++;
    }
    if (steps >= 12) acc = 0;
    // trânsito
    const night = atmo.state.night;
    const tr = traffic.update(dt, phys, night, camera.position, R.quality);
    for (const c of traffic.cars) c.cutCd = (c.cutCd || 0) - dt;
    if (playing && !phys.crashed) {
      for (const ev of tr.events) {
        if (ev.type === 'hit') { if (ev.rel > 3.5 || phys.v > 4) phys.crash('BATEU NO CARRO!'); else phys.v *= 0.5; }
        else if (ev.type === 'near' && tricks.combo && phys.v > 5) tricks.cut(ev.car);
        else if (ev.type === 'honk') { const d = Math.hypot(ev.car.x - phys.x, ev.car.z - phys.z); if (d < 30) audio.horn(); }
      }
    }
    const key = tr.phase.av + tr.phase.st;
    if (key !== lightPhaseKey) { lightPhaseKey = key; props.setLights(tr.phase.av, tr.phase.st); }
    // queda e reposicionamento
    if (phys.crashed) {
      crashTimer -= dt;
      if (crashTimer <= 0) respawn(false);
    } else if (playing) {
      safeTimer += dt;
      if (safeTimer > 1.2 && phys.v > 3 && Math.abs(phys.pitch) < 0.05 && phys.lastSurface !== 'sand' && phys.lastSurface !== 'water') {
        safeTimer = 0;
        let ok = !city.collide(phys.x, phys.z, 2.5);
        for (const c of traffic.cars) if (Math.abs(c.x - phys.x) < 14 && Math.abs(c.z - phys.z) < 14) ok = false;
        if (ok) lastSafe = { x: phys.x, z: phys.z, h: phys.h };
      }
    }
    updateMission();
    effects(dt);
  }

  // feed de manobras
  for (const e of tricks.events) {
    ui.feed(e.text, e.cls);
    if (e.sound === 'trick') audio.chime(820, 0.12, 0.06);
    else if (e.sound === 'bank') audio.chime(990, 0.25, 0.09);
    else if (e.sound === 'cut') audio.chime(1240, 0.1, 0.07);
  }
  tricks.events.length = 0;

  bike.night = atmo.state.night;
  bike.update(dt, phys, rig.mode);
  if (state === 'garage') { garageAngle += dt * 0.25 + (input.mouse.down ? input.mouse.dx * 0.006 : 0); }
  rig.update(dt, phys, bike, input, (x, z) => city.surfaceAt(x, z).h, { menu: state === 'menu' || (state === 'settings' || state === 'controls') && prevState === 'menu', garage: state === 'garage', garageAngle, collide: (x, z, r) => city.collide(x, z, r) });
  atmo.update(frozen ? 0 : dt, tmpV.set(phys.x, phys.y, phys.z));
  atmo.sky.position.copy(camera.position);
  props.update(dt, atmo.state.night, camera.position, R.quality);
  fx.update(frozen ? 0 : dt, 0.25 + atmo.state.day * 0.75);
  const spec = phys.spec;
  audio.update(dt, {
    active: (state === 'play' || state === 'menu' || state === 'garage'), rpm: phys.rpm, redline: spec.redline, throttle: phys.throttle, prevThrottle: phys._prevThr || 0,
    limiter: phys.limiter, speed: phys.v, skid: Math.max(phys.spin * 0.7, phys.brakingR > 0.5 && phys.v > 6 ? 0.6 : 0), scrape: phys.tail || phys.scrapePeg,
    escape: (bikeSave(spec.key).upgrades.escape || 0) > 0, inMenu: state !== 'play', seaDist: Math.max(0, SAND_X0 + 30 - phys.x),
  });
  phys._prevThr = phys.throttle;

  // HUD a ~60 Hz
  hudTimer -= dt;
  if (state === 'play' && hudTimer <= 0) {
    hudTimer = 1 / 60;
    const info = R.r.info;
    ui.updateHud(1 / 60, {
      speed: phys.v, gear: phys.gear, rpm: phys.rpm, redline: spec.redline, throttle: phys.throttle,
      pitchDeg: phys.pitch * 57.2958, balanceDeg: phys.balanceAngle * 57.2958, tailDeg: phys.tailAngle * 57.2958,
      money: save.money, hour: atmo.hour, combo: tricks.combo, mission, missionProgress,
      showFps: save.settings.showFps, fps: fpsEma, drawCalls: info.render.calls, tris: info.render.triangles, resScale: R.resScale,
    });
    ui.minimap(phys, traffic.cars, phys.h);
  }

  R.render(dt, Math.min(1, phys.v / 40));
  if (state === 'play') R.adapt(frameMs);
  input.endFrame();
}

function handleKeys() {
  if (input.hit('Escape')) {
    if (state === 'play') goPause();
    else if (state === 'pause') goPlay();
    else if (state === 'garage' || state === 'settings' || state === 'controls') back();
  }
  if (input.hit('F3')) { save.settings.showFps = !save.settings.showFps; persist(); }
  if (state !== 'play') return;
  if (input.hit('KeyC')) ui.feed('Câmera: ' + rig.next(), 'info');
  if (input.hit('KeyR')) respawn(false);
  if (input.hit('KeyH')) audio.horn();
  if (!phys.autoGear) { if (input.hit('KeyX')) phys.shift(1); if (input.hit('KeyZ')) phys.shift(-1); }
}

function onBank(pts, cash, c) {
  save.money += cash;
  if (c.time > save.best.time) save.best.time = c.time;
  if (c.dist > save.best.dist) save.best.dist = c.dist;
  if (pts > save.best.combo) save.best.combo = pts;
  persist();
}

function updateMission() {
  const c = tricks.combo;
  let v = 0;
  if (c) {
    switch (mission.type) {
      case 'time': v = c.grau.time; break;
      case 'dist': v = c.grau.dist; break;
      case 'balance': v = c.balance; break;
      case 'stoppie': v = c.stoppie; break;
      case 'cut': v = c.cuts; break;
      case 'rabeta': v = c.rabeta; break;
      case 'speed': v = phys.pitch > 0.14 ? phys.v * 3.6 : 0; break;
      case 'points': v = c.points; break;
      case 'turn': v = c.turn; break;
      case 'clutch': v = c.clutch; break;
    }
  }
  missionProgress = Math.max(c ? missionProgress : 0, v);
  if (!c) missionProgress = 0;
  if (missionProgress >= mission.goal && state === 'play') {
    save.money += mission.reward;
    ui.feed(`MISSÃO CUMPRIDA · R$ ${mission.reward.toLocaleString('pt-BR')}`, 'mission');
    audio.chime(1320, 0.4, 0.1);
    save.mission++;
    mission = missionAt(save.mission);
    missionProgress = 0;
    persist();
  }
}

function effects(dt) {
  const P = phys;
  const fwd = tmpF.set(Math.sin(P.h), 0, Math.cos(P.h));
  const rear = tmpV.set(P.x, P.y + 0.05, P.z);
  // fumaça e marca de pneu
  const spin = P.spin;
  if (!P.crashed && spin > 0.25 && P.lastSurface !== 'sand') { fx.tireSmoke(rear, Math.min(3, spin * 1.5), fwd); fx.skid(rear.clone(), fwd, 0.09, 0.4 + spin * 0.3); }
  else if (!P.crashed && P.brakingR > 0.5 && P.v > 7 && P.pitch < 0.05 && P.lastSurface === 'road') fx.skid(rear.clone(), fwd, 0.08, 0.35);
  else fx.breakSkid();
  if (P.lastSurface === 'sand' && P.v > 3) fx.dust(rear, Math.min(1, P.v / 15));
  // faíscas da rabeta e da pedaleira
  if (P.tail && bike.n.tail_tip) {
    const tp = bike.n.tail_tip.getWorldPosition(new THREE.Vector3());
    tp.y = P.y + 0.03;
    fx.spark(tp, fwd.clone().multiplyScalar(-P.v * 0.4), 4);
  }
  if (P.scrapePeg) {
    const side = new THREE.Vector3(-Math.cos(P.h), 0, Math.sin(P.h)).multiplyScalar(Math.sign(P.lean) * 0.55);
    fx.spark(new THREE.Vector3(P.x, P.y + 0.03, P.z).add(side).addScaledVector(fwd, 0.5), fwd.clone().multiplyScalar(-P.v * 0.3), 2);
  }
  if (P.crashed && bike.slideSpeed > 2) fx.spark(new THREE.Vector3(P.x, P.y + 0.05, P.z), fwd.clone().multiplyScalar(-bike.slideSpeed * 0.3), 3);
}

boot().catch((e) => {
  console.error(e);
  ui.loading(1, 'Erro ao iniciar: ' + (e && e.message ? e.message : e));
});
window.__game = { THREE, rig, get city() { return city; }, get phys() { return phys; }, get state() { return state; }, R, tricks, get traffic() { return traffic; }, get atmo() { return atmo; }, goPlay, goMenu, get bike() { return bike; }, get save() { return save; } };
