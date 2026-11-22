/* Grau Livre — jogo de grau de moto para desktop (three.js r149) */
(function () {
  'use strict';
  const T = THREE;
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const DEG = 180 / Math.PI;
  const rand = (a, b) => a + Math.random() * (b - a);

  // ------------------------------------------------------------------
  // Dados: motos, upgrades, missões, save
  // ------------------------------------------------------------------
  const BIKES = [
    { id: 'pardal', name: 'Pardal 110', price: 0, maxSpeed: 22, accel: 7, lift: 1.0, stab: 1.0, color: '#e23b3b', tier: 0 },
    { id: 'cobra', name: 'Cobra 160', price: 1500, maxSpeed: 28, accel: 9, lift: 1.08, stab: 1.1, color: '#2b7de9', tier: 1 },
    { id: 'trovao', name: 'Trovão 300', price: 5000, maxSpeed: 36, accel: 12, lift: 1.18, stab: 1.22, color: '#f2c230', tier: 2 },
    { id: 'fera', name: 'Fera 600', price: 15000, maxSpeed: 46, accel: 15, lift: 1.3, stab: 1.35, color: '#1fbf75', tier: 3 },
  ];
  const UPG = [
    { id: 'motor', name: 'Motor', desc: '+6% velocidade e +8% aceleração por nível' },
    { id: 'equi', name: 'Equilíbrio', desc: 'Grau mais estável, mais fácil de segurar' },
    { id: 'freio', name: 'Freio traseiro', desc: 'Abaixa a frente com mais precisão' },
  ];
  const UPG_MAX = 5;
  const COLORS = ['#e23b3b', '#ff7a1a', '#f2c230', '#1fbf75', '#17c3d6', '#2b7de9', '#8b5cf6', '#ec4899', '#f3f1ea', '#222428'];
  const upgCost = (bike, lvl) => Math.round((250 + bike.price * 0.12) * (lvl + 1));

  const MISSIONS = [
    { type: 'time', goal: 3, reward: 150, text: (g) => `Segure um grau por ${g}s` },
    { type: 'dist', goal: 40, reward: 200, text: (g) => `Ande ${g} m em um grau` },
    { type: 'zone', goal: 2, reward: 250, text: (g) => `Fique ${g}s na zona do grau (45°–80°)` },
    { type: 'speed', goal: 50, reward: 250, text: (g) => `Esteja a ${g} km/h no grau` },
    { type: 'cut', goal: 1, reward: 300, text: (g) => `Raspe ${g} carro durante o grau` },
    { type: 'points', goal: 400, reward: 350, text: (g) => `Faça ${g} pts em um único grau` },
    { type: 'time', goal: 8, reward: 400, text: (g) => `Segure um grau por ${g}s` },
    { type: 'dist', goal: 150, reward: 450, text: (g) => `Ande ${g} m em um grau` },
    { type: 'cut', goal: 3, reward: 600, text: (g) => `Raspe ${g} carros em um único grau` },
    { type: 'zone', goal: 8, reward: 600, text: (g) => `Fique ${g}s na zona do grau` },
    { type: 'points', goal: 1500, reward: 800, text: (g) => `Faça ${g} pts em um único grau` },
    { type: 'time', goal: 20, reward: 1000, text: (g) => `Segure um grau por ${g}s` },
  ];
  function missionAt(i) {
    const base = MISSIONS[i % MISSIONS.length];
    const cycle = Math.floor(i / MISSIONS.length);
    const k = 1 + cycle * 0.6;
    const goal = base.type === 'speed' ? Math.min(160, Math.round(base.goal * k)) : Math.round(base.goal * k * 10) / 10;
    return { type: base.type, goal, reward: Math.round(base.reward * (1 + cycle)), text: base.text(goal) };
  }

  const SAVE_KEY = 'grau-livre-save-v1';
  const defaultSave = () => ({
    money: 300, owned: ['pardal'], current: 'pardal', upgrades: {}, colors: {},
    best: { time: 0, dist: 0, points: 0 }, mission: 0, settings: { sound: true, night: false, cam: 0 },
  });
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s) { const d = defaultSave(); return Object.assign(d, s, { best: Object.assign(d.best, s.best), settings: Object.assign(d.settings, s.settings) }); }
    } catch (e) { /* sem storage */ }
    return defaultSave();
  }
  let save = loadSave();
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
  function ups(id) { return save.upgrades[id] || (save.upgrades[id] = { motor: 0, equi: 0, freio: 0 }); }
  const bikeDef = (id) => BIKES.find((b) => b.id === id) || BIKES[0];
  const bikeColor = (b) => save.colors[b.id] || b.color;
  function computeStats() {
    const b = bikeDef(save.current), u = ups(b.id);
    return {
      ...b,
      maxSpeed: b.maxSpeed * (1 + u.motor * 0.06),
      accel: b.accel * (1 + u.motor * 0.08),
      damp: (5.5 + u.equi * 0.4) * b.stab,
      spring: 2 + u.equi * 0.8,
      brakeT: 30 + u.freio * 5,
    };
  }
  let stats = computeStats();

  // ------------------------------------------------------------------
  // Renderer / cena
  // ------------------------------------------------------------------
  const canvas = $('#game');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(65, 1, 0.1, 1200);
  scene.fog = new T.Fog(0xa9c7e8, 120, 520);

  const hemi = new T.HemisphereLight(0xcfe3ff, 0x5a5040, 0.75);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff2dd, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------------
  // Cidade
  // ------------------------------------------------------------------
  const N = 8, BW = 50, RW = 16, S = BW + RW, HALF = (N * S) / 2;
  const LIMIT = HALF + RW / 2 - 0.5;
  const roadLine = (k) => k * S - HALF;
  const isPlaza = (i, j) => (i === 3 || i === 4) && (j === 3 || j === 4);
  const PLAZA_MIN = roadLine(3) + RW / 2, PLAZA_MAX = roadLine(5) - RW / 2;
  const inPlaza = (x, z) => x > PLAZA_MIN - 1 && x < PLAZA_MAX + 1 && z > PLAZA_MIN - 1 && z < PLAZA_MAX + 1;
  const colliders = [];
  const nightMats = { windows: null, lamps: null, carFront: null, carRear: null };

  function windowTextures() {
    const size = 256, cells = 4, cs = size / cells;
    const c1 = document.createElement('canvas'); c1.width = c1.height = size;
    const c2 = document.createElement('canvas'); c2.width = c2.height = size;
    const a = c1.getContext('2d'), b = c2.getContext('2d');
    a.fillStyle = '#e6e2da'; a.fillRect(0, 0, size, size);
    b.fillStyle = '#000'; b.fillRect(0, 0, size, size);
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
      const px = x * cs + 12, py = y * cs + 14, w = cs - 24, h = cs - 26;
      a.fillStyle = '#c9c4ba'; a.fillRect(x * cs + 6, y * cs + cs - 9, cs - 12, 4);
      const g = a.createLinearGradient(px, py, px + w, py + h);
      g.addColorStop(0, '#3b4a5e'); g.addColorStop(1, '#1d2633');
      a.fillStyle = g; a.fillRect(px, py, w, h);
      a.fillStyle = 'rgba(255,255,255,.18)'; a.fillRect(px + 2, py + 2, w * 0.35, h - 4);
      if (Math.random() < 0.45) { b.fillStyle = Math.random() < 0.7 ? '#ffd88a' : '#bfe0ff'; b.fillRect(px, py, w, h); }
    }
    const map = new T.CanvasTexture(c1), em = new T.CanvasTexture(c2);
    for (const t of [map, em]) { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; }
    map.encoding = T.sRGBEncoding; em.encoding = T.sRGBEncoding;
    return { map, em };
  }

  function buildCity() {
    // chão
    const grass = new T.Mesh(new T.PlaneGeometry(3000, 3000), new T.MeshStandardMaterial({ color: 0x4f6b3a, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.05; grass.receiveShadow = true; scene.add(grass);
    const asphalt = new T.Mesh(new T.PlaneGeometry(N * S + RW, N * S + RW), new T.MeshStandardMaterial({ color: 0x2b2c31, roughness: 0.95 }));
    asphalt.rotation.x = -Math.PI / 2; asphalt.receiveShadow = true; scene.add(asphalt);

    // calçadas
    const walkGeo = new T.BoxGeometry(BW, 0.12, BW);
    const walkMat = new T.MeshStandardMaterial({ color: 0x8d8b86, roughness: 0.9 });
    const walks = new T.InstancedMesh(walkGeo, walkMat, N * N);
    let wi = 0; const m4 = new T.Matrix4();
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (isPlaza(i, j)) continue;
      m4.makeTranslation(roadLine(i) + S / 2, 0.06, roadLine(j) + S / 2);
      walks.setMatrixAt(wi++, m4);
    }
    walks.count = wi; walks.receiveShadow = true; scene.add(walks);

    // prédios (geometria única com UV escalada pelas dimensões)
    const tex = windowTextures();
    const box = new T.BoxGeometry(1, 1, 1);
    const bp = box.attributes.position.array, bn = box.attributes.normal.array, bu = box.attributes.uv.array, bi = box.index.array;
    const pos = [], nor = [], uv = [], col = [], idx = []; let vo = 0;
    const WIN = 12;
    const palette = [0xd8cfc0, 0xc9b79c, 0xb9c4c9, 0xe0d6b8, 0xc48f73, 0x9fb0a3, 0xd9a7a0, 0xa8a3b8, 0xe8e4dc, 0x8f9aa6];
    const tmpC = new T.Color();
    function addBox(cx, cz, w, d, h, color, y0, collide, windows) {
      tmpC.set(color);
      for (let v = 0; v < 24; v++) {
        pos.push(cx + bp[v * 3] * w, (y0 || 0) + bp[v * 3 + 1] * h + h / 2, cz + bp[v * 3 + 2] * d);
        nor.push(bn[v * 3], bn[v * 3 + 1], bn[v * 3 + 2]);
        const face = Math.floor(v / 4); let u = bu[v * 2], vv = bu[v * 2 + 1];
        if (!windows || face === 2 || face === 3) { u = 0.01; vv = 0.01; }
        else if (face < 2) { u *= Math.max(1, Math.round(d / 3)) / 4; vv *= Math.max(1, Math.round(h / 3)) / 4; }
        else { u *= Math.max(1, Math.round(w / 3)) / 4; vv *= Math.max(1, Math.round(h / 3)) / 4; }
        uv.push(u, vv); col.push(tmpC.r, tmpC.g, tmpC.b);
      }
      for (let k = 0; k < bi.length; k++) idx.push(bi[k] + vo);
      vo += 24;
      if (collide) colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    }
    void WIN;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (isPlaza(i, j)) continue;
      const bx = roadLine(i) + S / 2, bz = roadLine(j) + S / 2;
      const inset = 4, lot = (BW - inset * 2) / 2;
      const centerDist = Math.hypot(bx, bz) / HALF;
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        if (Math.random() < 0.08) continue; // terreno vazio
        const cx = bx - lot / 2 + a * lot, cz = bz - lot / 2 + b * lot;
        const w = lot - rand(1, 4), d = lot - rand(1, 4);
        let h = rand(7, 22) * (1.6 - centerDist * 0.7);
        if (Math.random() < 0.12) h *= 2.2;
        h = Math.round(h / 3) * 3 + 0.01;
        const color = palette[(Math.random() * palette.length) | 0];
        addBox(cx, cz, w, d, h, color, 0, true, true);
        // detalhes no telhado
        addBox(cx, cz, w + 0.4, d + 0.4, 0.6, 0x7a7670, h, false, false);
        if (Math.random() < 0.6) addBox(cx + rand(-w / 4, w / 4), cz + rand(-d / 4, d / 4), rand(2, 4), rand(2, 4), rand(1.5, 3), 0x9a958c, h + 0.6, false, false);
      }
    }
    // muros do limite
    const wallC = 0x6f6c66, L = N * S + RW + 2;
    addBox(0, -HALF - RW / 2 - 1, L, 2, 3, wallC, 0, true, false);
    addBox(0, HALF + RW / 2 + 1, L, 2, 3, wallC, 0, true, false);
    addBox(-HALF - RW / 2 - 1, 0, 2, L, 3, wallC, 0, true, false);
    addBox(HALF + RW / 2 + 1, 0, 2, L, 3, wallC, 0, true, false);

    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const bMat = new T.MeshStandardMaterial({ map: tex.map, vertexColors: true, roughness: 0.85, emissive: 0xffffff, emissiveMap: tex.em, emissiveIntensity: 0 });
    nightMats.windows = bMat;
    const buildings = new T.Mesh(g, bMat);
    buildings.castShadow = true; buildings.receiveShadow = true; scene.add(buildings);

    // faixas da pista
    const dashGeo = new T.PlaneGeometry(0.25, 3); dashGeo.rotateX(-Math.PI / 2);
    const dashes = new T.InstancedMesh(dashGeo, new T.MeshBasicMaterial({ color: 0xd9d4c3 }), 4000);
    let di = 0; const q = new T.Quaternion(), sc3 = new T.Vector3(1, 1, 1), p3 = new T.Vector3();
    const qz = new T.Quaternion(), qx = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2);
    for (let k = 0; k <= N; k++) {
      const line = roadLine(k);
      for (let t = -HALF; t <= HALF; t += 6) {
        let nearCross = false;
        for (let m = 0; m <= N; m++) if (Math.abs(t - roadLine(m)) < RW / 2 + 1.5) nearCross = true;
        if (nearCross) continue;
        if (!inPlaza(line, t)) { p3.set(line, 0.01, t); m4.compose(p3, qz, sc3); dashes.setMatrixAt(di++, m4); }
        if (!inPlaza(t, line)) { p3.set(t, 0.01, line); m4.compose(p3, qx, sc3); dashes.setMatrixAt(di++, m4); }
      }
    }
    dashes.count = di; scene.add(dashes); void q;

    // postes
    const poleGeo = new T.CylinderGeometry(0.09, 0.12, 6, 6); poleGeo.translate(0, 3, 0);
    const headGeo = new T.BoxGeometry(0.5, 0.18, 0.9); headGeo.translate(0, 6, 0);
    const poleMat = new T.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.4 });
    const lampMat = new T.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xffd89a, emissiveIntensity: 0 });
    nightMats.lamps = lampMat;
    const poles = new T.InstancedMesh(poleGeo, poleMat, N * N * 4);
    const heads = new T.InstancedMesh(headGeo, lampMat, N * N * 4);
    let pi = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (isPlaza(i, j)) continue;
      const bx = roadLine(i) + S / 2, bz = roadLine(j) + S / 2, o = BW / 2 - 1.2;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        m4.makeTranslation(bx + sx * o, 0, bz + sz * o);
        poles.setMatrixAt(pi, m4); heads.setMatrixAt(pi, m4); pi++;
      }
    }
    poles.count = heads.count = pi; poles.castShadow = true; scene.add(poles, heads);

    buildPlaza();
  }

  function buildPlaza() {
    const size = PLAZA_MAX - PLAZA_MIN, c = (PLAZA_MIN + PLAZA_MAX) / 2;
    const slab = new T.Mesh(new T.BoxGeometry(size, 0.04, size), new T.MeshStandardMaterial({ color: 0x37383d, roughness: 0.9 }));
    slab.position.set(c, 0.02, c); slab.receiveShadow = true; scene.add(slab);
    // pintura no chão
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
    const x = cv.getContext('2d');
    x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, 1024, 256);
    x.font = 'italic 900 150px "Segoe UI", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,178,30,.85)'; x.fillText('ZONA DO GRAU', 512, 130);
    const t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding;
    const paint = new T.Mesh(new T.PlaneGeometry(40, 10), new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    paint.rotation.x = -Math.PI / 2; paint.position.set(c, 0.05, c + 22); scene.add(paint);
    // linha de largada
    const stripes = new T.Mesh(new T.PlaneGeometry(14, 1.2), new T.MeshBasicMaterial({ color: 0xffffff }));
    stripes.rotation.x = -Math.PI / 2; stripes.position.set(c, 0.05, c - 30); scene.add(stripes);
    // cones de slalom
    const coneGeo = new T.ConeGeometry(0.3, 0.8, 10); coneGeo.translate(0, 0.4, 0);
    const cones = new T.InstancedMesh(coneGeo, new T.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }), 40);
    const m4 = new T.Matrix4(); let ci = 0;
    for (let k = 0; k < 10; k++) { m4.makeTranslation(c - 28 + (k % 2) * 4, 0.04, c - 20 + k * 6); cones.setMatrixAt(ci++, m4); }
    for (let k = 0; k < 10; k++) { m4.makeTranslation(c + 28 - (k % 2) * 4, 0.04, c - 20 + k * 6); cones.setMatrixAt(ci++, m4); }
    cones.count = ci; cones.castShadow = true; scene.add(cones);
    // árvores na borda
    const trunkGeo = new T.CylinderGeometry(0.18, 0.25, 2.4, 6); trunkGeo.translate(0, 1.2, 0);
    const leafGeo = new T.IcosahedronGeometry(1.8, 0); leafGeo.translate(0, 3.6, 0);
    const trunks = new T.InstancedMesh(trunkGeo, new T.MeshStandardMaterial({ color: 0x6b4a2f }), 80);
    const leaves = new T.InstancedMesh(leafGeo, new T.MeshStandardMaterial({ color: 0x3f7d3a, flatShading: true }), 80);
    let ti = 0;
    for (let s = 0; s < 4; s++) for (let k = 0; k < 12; k++) {
      const along = PLAZA_MIN + 4 + k * ((size - 8) / 11), edge = s % 2 ? PLAZA_MIN + 2 : PLAZA_MAX - 2;
      if (Math.abs(along - c) < 12) continue; // entradas
      const px = s < 2 ? along : edge, pz = s < 2 ? edge : along;
      const sca = rand(0.8, 1.2);
      m4.makeScale(sca, sca, sca).setPosition(px, 0, pz);
      trunks.setMatrixAt(ti, m4); leaves.setMatrixAt(ti, m4); ti++;
    }
    trunks.count = leaves.count = ti; trunks.castShadow = leaves.castShadow = true; scene.add(trunks, leaves);
  }

  buildCity();

  // ------------------------------------------------------------------
  // Moto + piloto
  // ------------------------------------------------------------------
  const WR = 0.32, WB = 1.36;
  const bikeRoot = new T.Group(); // posição e direção
  const leanGroup = new T.Group(); // inclinação lateral
  const pitchPivot = new T.Group(); // empinada, eixo traseiro
  pitchPivot.position.y = WR;
  bikeRoot.add(leanGroup); leanGroup.add(pitchPivot); scene.add(bikeRoot);
  let bikeParts = null;
  const headlight = new T.SpotLight(0xfff1d0, 0, 60, 0.5, 0.5, 1.2);
  headlight.position.set(0, 0.7, WB + 0.1);
  const hlTarget = new T.Object3D(); hlTarget.position.set(0, -1.5, WB + 12);
  pitchPivot.add(headlight, hlTarget); headlight.target = hlTarget;

  function mesh(geo, mat, x, y, z) { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m; }

  function buildBike(def) {
    if (bikeParts) pitchPivot.remove(bikeParts.group);
    const g = new T.Group();
    const s = 1 + def.tier * 0.06;
    const paint = new T.MeshStandardMaterial({ color: bikeColor(def), roughness: 0.35, metalness: 0.3 });
    const black = new T.MeshStandardMaterial({ color: 0x151618, roughness: 0.8 });
    const metal = new T.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.3, metalness: 0.9 });
    const tire = new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
    const suit = new T.MeshStandardMaterial({ color: 0x23324a, roughness: 0.8 });
    const jeans = new T.MeshStandardMaterial({ color: 0x2c3e66, roughness: 0.9 });
    const helmet = new T.MeshStandardMaterial({ color: 0xf3f1ea, roughness: 0.25, metalness: 0.2 });
    const visor = new T.MeshStandardMaterial({ color: 0x111622, roughness: 0.1, metalness: 0.6 });

    function wheel() {
      const w = new T.Group();
      const tg = new T.TorusGeometry(WR - 0.07, 0.075, 10, 24); tg.rotateY(Math.PI / 2);
      w.add(mesh(tg, tire));
      const rim = new T.CylinderGeometry(WR - 0.12, WR - 0.12, 0.05, 16, 1, true); rim.rotateZ(Math.PI / 2);
      w.add(mesh(rim, metal));
      const spokeG = new T.BoxGeometry(0.03, (WR - 0.12) * 2, 0.04);
      for (let k = 0; k < 3; k++) { const sp = mesh(spokeG, metal); sp.rotation.x = (k * Math.PI) / 3; w.add(sp); }
      const hub = new T.CylinderGeometry(0.05, 0.05, 0.14, 8); hub.rotateZ(Math.PI / 2); w.add(mesh(hub, metal));
      return w;
    }
    const rear = wheel(), front = wheel();
    front.position.z = WB;
    g.add(rear, front);

    // quadro / tanque / banco
    const swing = mesh(new T.BoxGeometry(0.08, 0.06, 0.62), metal, 0.1, 0.06, 0.3); swing.rotation.x = -0.18; g.add(swing);
    g.add(mesh(new T.BoxGeometry(0.28, 0.32, 0.46 * s), black, 0, 0.18, 0.62)); // motor
    g.add(mesh(new T.BoxGeometry(0.34, 0.22, 0.5 * s), paint, 0, 0.5, 0.82)); // tanque
    g.add(mesh(new T.BoxGeometry(0.28, 0.1, 0.62), black, 0, 0.47, 0.32)); // banco
    const tail = mesh(new T.BoxGeometry(0.24, 0.1, 0.42), paint, 0, 0.5, -0.05); tail.rotation.x = 0.25; g.add(tail);
    const fork = mesh(new T.CylinderGeometry(0.03, 0.03, 0.86, 6), metal, 0.11, 0.38, WB - 0.12); fork.rotation.x = 0.42; g.add(fork);
    const fork2 = fork.clone(); fork2.position.x = -0.11; g.add(fork2);
    const bar = mesh(new T.CylinderGeometry(0.02, 0.02, 0.7, 6), black, 0, 0.8, WB - 0.36); bar.rotation.z = Math.PI / 2; g.add(bar);
    g.add(mesh(new T.BoxGeometry(0.18, 0.16, 0.08), black, 0, 0.7, WB - 0.24)); // farol carcaça
    const lens = mesh(new T.CircleGeometry(0.065, 12), new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 0.6 }), 0, 0.7, WB - 0.195);
    g.add(lens);
    const ex = mesh(new T.CylinderGeometry(0.05, 0.06, 0.7, 8), metal, 0.2, 0.2, 0.05); ex.rotation.x = Math.PI / 2 - 0.25; g.add(ex);
    const fend = mesh(new T.BoxGeometry(0.16, 0.03, 0.4), paint, 0, WR + 0.06, WB); g.add(fend);
    if (def.tier >= 2) { // carenagem esportiva
      const fair = mesh(new T.BoxGeometry(0.4, 0.38, 0.38), paint, 0, 0.62, WB - 0.3); fair.rotation.x = -0.5; g.add(fair);
      g.add(mesh(new T.BoxGeometry(0.36, 0.24, 0.7), paint, 0, 0.3, 0.78));
    }
    const brakeLight = mesh(new T.BoxGeometry(0.12, 0.05, 0.03), new T.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.3 }), 0, 0.52, -0.27);
    g.add(brakeLight);

    // piloto (articulado no quadril)
    const rider = new T.Group(); rider.position.set(0, 0.56, 0.32); g.add(rider);
    const torso = new T.Group(); rider.add(torso);
    torso.add(mesh(new T.BoxGeometry(0.38, 0.55, 0.24), suit, 0, 0.3, 0));
    const head = new T.Group(); head.position.set(0, 0.7, 0.04); torso.add(head);
    head.add(mesh(new T.SphereGeometry(0.16, 14, 10), helmet));
    const vz = mesh(new T.BoxGeometry(0.22, 0.09, 0.05), visor, 0, 0.01, 0.14); head.add(vz);
    const armG = new T.BoxGeometry(0.09, 0.09, 0.55);
    const armL = mesh(armG, suit, 0.2, 0.45, 0.24), armR = mesh(armG, suit, -0.2, 0.45, 0.24);
    armL.rotation.x = armR.rotation.x = 0.5; torso.add(armL, armR);
    const thighG = new T.BoxGeometry(0.13, 0.13, 0.46);
    rider.add(mesh(thighG, jeans, 0.16, 0.0, 0.2), mesh(thighG, jeans, -0.16, 0.0, 0.2));
    const shinG = new T.BoxGeometry(0.11, 0.4, 0.11);
    const shinL = mesh(shinG, jeans, 0.17, -0.2, 0.4), shinR = mesh(shinG, jeans, -0.17, -0.2, 0.4);
    shinL.rotation.x = shinR.rotation.x = -0.3; rider.add(shinL, shinR);

    g.scale.setScalar(s);
    pitchPivot.add(g);
    bikeParts = { group: g, rear, front, torso, head, paint, brakeLight, lens };
    headlight.position.set(0, 0.7 * s, (WB - 0.2) * s);
  }
  buildBike(bikeDef(save.current));

  // ------------------------------------------------------------------
  // Trânsito
  // ------------------------------------------------------------------
  const cars = [];
  const carBodyGeo = new T.BoxGeometry(1.9, 0.65, 4.2); carBodyGeo.translate(0, 0.62, 0);
  const cabinGeo = new T.BoxGeometry(1.7, 0.55, 2.1); cabinGeo.translate(0, 1.22, -0.2);
  const carWheelGeo = new T.CylinderGeometry(0.34, 0.34, 0.28, 12); carWheelGeo.rotateZ(Math.PI / 2);
  const glassMat = new T.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.5 });
  const tireMat = new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const frontLightMat = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0c8, emissiveIntensity: 0.2 });
  const rearLightMat = new T.MeshStandardMaterial({ color: 0x440000, emissive: 0xff2020, emissiveIntensity: 0.3 });
  nightMats.carFront = frontLightMat; nightMats.carRear = rearLightMat;
  const lightGeo = new T.BoxGeometry(0.4, 0.15, 0.05);
  const carColors = [0xf2f2f2, 0x1d1f24, 0xa6acb4, 0xb3202a, 0x1f4fa0, 0x2d6e3a, 0xe0b02a, 0x7a3d9c, 0x6b4a2f];

  function makeCar() {
    const g = new T.Group();
    const paint = new T.MeshStandardMaterial({ color: carColors[(Math.random() * carColors.length) | 0], roughness: 0.4, metalness: 0.4 });
    const body = new T.Mesh(carBodyGeo, paint); body.castShadow = true; g.add(body);
    const cab = new T.Mesh(cabinGeo, glassMat); cab.castShadow = true; g.add(cab);
    for (const [x, z] of [[0.85, 1.35], [-0.85, 1.35], [0.85, -1.35], [-0.85, -1.35]]) { const w = new T.Mesh(carWheelGeo, tireMat); w.position.set(x, 0.34, z); g.add(w); }
    for (const x of [0.62, -0.62]) {
      const f = new T.Mesh(lightGeo, frontLightMat); f.position.set(x, 0.7, 2.11); g.add(f);
      const r = new T.Mesh(lightGeo, rearLightMat); r.position.set(x, 0.75, -2.11); g.add(r);
    }
    scene.add(g);
    return g;
  }

  for (let k = 0; k <= N; k++) {
    if (k === 4) continue; // linha que atravessa a praça
    for (const axis of ['x', 'z']) for (const dir of [1, -1]) {
      const count = Math.random() < 0.6 ? 2 : 1;
      for (let c = 0; c < count; c++) {
        const lane = roadLine(k) + (axis === 'x' ? dir * 3.8 : -dir * 3.8);
        const car = { axis, dir, lane, t: rand(-HALF, HALF), base: rand(8, 14), v: 10, mesh: makeCar(), cutCd: 0 };
        car.mesh.rotation.y = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI;
        cars.push(car);
      }
    }
  }
  function carXZ(c) { return c.axis === 'x' ? [c.t, c.lane] : [c.lane, c.t]; }

  // ------------------------------------------------------------------
  // Estado do jogador
  // ------------------------------------------------------------------
  const SPAWN = { x: 0, z: -24, h: 0 };
  const P = { x: SPAWN.x, z: SPAWN.z, h: SPAWN.h, speed: 0, pitch: 0, pitchVel: 0, lean: 0, rpm: 0, gear: 0 };
  let crashed = 0, crashLean = 0, lastSafe = { x: SPAWN.x, z: SPAWN.z, h: SPAWN.h }, safeTimer = 0;
  let cur = null; // grau atual
  let state = 'menu';
  let camMode = save.settings.cam || 0;
  let shake = 0;

  function newGrau() { return { time: 0, dist: 0, points: 0, mult: 1, zone: 0, cuts: 0, maxSpeed: 0 }; }
  function respawn(toSafe) {
    const s = toSafe ? lastSafe : SPAWN;
    Object.assign(P, { x: s.x, z: s.z, h: s.h, speed: 0, pitch: 0, pitchVel: 0, lean: 0 });
    crashed = 0; crashLean = 0; cur = null;
    $('#crash').classList.add('hidden');
  }

  // ------------------------------------------------------------------
  // Entrada (teclado + controle)
  // ------------------------------------------------------------------
  const keys = new Set();
  const once = new Set();
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!keys.has(e.code)) once.add(e.code);
    keys.add(e.code);
    audio.resume();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  let padPrev = [];
  function readInput() {
    const k = (...c) => c.some((x) => keys.has(x));
    const inp = {
      throttle: k('KeyW', 'ArrowUp') ? 1 : 0,
      brake: k('KeyS', 'ArrowDown') ? 1 : 0,
      steer: (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0),
      pull: k('Space', 'ShiftLeft', 'ShiftRight') ? 1 : 0,
    };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const b = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      inp.throttle = Math.max(inp.throttle, b(7));
      inp.brake = Math.max(inp.brake, b(6));
      inp.pull = Math.max(inp.pull, b(0));
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.15) inp.steer = ax;
      const pressed = (i) => b(i) > 0.5 && !padPrev[i];
      if (pressed(3)) once.add('KeyC');
      if (pressed(9)) once.add('Escape');
      if (pressed(2)) once.add('KeyR');
      padPrev = p.buttons.map((x) => x.value > 0.5);
      break;
    }
    return inp;
  }

  // ------------------------------------------------------------------
  // Áudio do motor (sintetizado)
  // ------------------------------------------------------------------
  const audio = (() => {
    let ctx = null, o1, o2, gain, filt, wind, windG;
    function init() {
      if (ctx) return;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      o2 = ctx.createOscillator(); o2.type = 'square';
      filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 900; filt.Q.value = 4;
      gain = ctx.createGain(); gain.gain.value = 0;
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      o1.connect(filt); o2.connect(g2); g2.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      // ruído de vento
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      wind = ctx.createBufferSource(); wind.buffer = buf; wind.loop = true;
      const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 600;
      windG = ctx.createGain(); windG.gain.value = 0;
      wind.connect(wf); wf.connect(windG); windG.connect(ctx.destination);
      o1.start(); o2.start(); wind.start();
    }
    return {
      resume() { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
      update(rpm, throttle, speed, on) {
        if (!ctx) return;
        const t = ctx.currentTime, vol = on && save.settings.sound ? 1 : 0;
        const f = 38 + rpm * 110;
        o1.frequency.setTargetAtTime(f, t, 0.03);
        o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
        filt.frequency.setTargetAtTime(500 + throttle * 1400 + rpm * 600, t, 0.05);
        gain.gain.setTargetAtTime(vol * (0.05 + throttle * 0.06), t, 0.05);
        windG.gain.setTargetAtTime(vol * Math.min(0.12, speed * 0.003), t, 0.1);
      },
      blip(freq, dur) {
        if (!ctx || !save.settings.sound) return;
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
        o.type = 'triangle'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
        g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur);
      },
      thud() {
        if (!ctx || !save.settings.sound) return;
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
        o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.5);
      },
    };
  })();

  // ------------------------------------------------------------------
  // Feedback (toasts)
  // ------------------------------------------------------------------
  function toast(text, cls) {
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || '');
    d.textContent = text;
    $('#toasts').appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }

  // ------------------------------------------------------------------
  // Missões
  // ------------------------------------------------------------------
  let mission = missionAt(save.mission);
  function missionValue(g) {
    if (!g) return 0;
    switch (mission.type) {
      case 'time': return g.time;
      case 'dist': return g.dist;
      case 'zone': return g.zone;
      case 'speed': return g.maxSpeed * 3.6;
      case 'cut': return g.cuts;
      case 'points': return g.points;
    }
    return 0;
  }
  function checkMission() {
    if (missionValue(cur) >= mission.goal) {
      save.money += mission.reward;
      toast(`MISSÃO COMPLETA! +R$ ${mission.reward}`, 'good big');
      audio.blip(660, 0.35);
      save.mission++; mission = missionAt(save.mission);
      persist(); updateMissionUI();
    }
  }
  function updateMissionUI() {
    $('#missionNum').textContent = '#' + (save.mission + 1);
    $('#missionText').textContent = mission.text;
    $('#missionBar').style.width = clamp((missionValue(cur) / mission.goal) * 100, 0, 100) + '%';
  }

  // ------------------------------------------------------------------
  // Física (passo fixo)
  // ------------------------------------------------------------------
  const C0 = 0.35; // ângulo do centro de massa -> ponto de equilíbrio ~70°
  const GRAV = 12;
  const BALANCE = 1.22; // ~70°
  const LOOP_OUT = 1.66; // ~95°

  function collideWorld(x, z, r) {
    if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) return true;
    for (const c of colliders) if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    return false;
  }

  function crash(reason) {
    if (crashed) return;
    crashed = 2.2; crashLean = P.lean >= 0 ? 1 : -1;
    shake = 0.6;
    if (cur && cur.time > 0.5) toast('Perdeu o grau!', 'bad');
    cur = null;
    $('#crash').textContent = reason || 'CAIU!';
    $('#crash').classList.remove('hidden');
    audio.thud();
  }

  function bankGrau() {
    const g = cur; cur = null;
    if (!g || g.time < 0.6) return;
    const pts = Math.round(g.points), cash = Math.max(1, Math.round(pts / 4));
    save.money += cash;
    let rec = '';
    if (g.time > save.best.time) { save.best.time = g.time; rec = ' RECORDE!'; }
    if (g.dist > save.best.dist) { save.best.dist = g.dist; rec = ' RECORDE!'; }
    if (pts > save.best.points) save.best.points = pts;
    toast(`+${pts} pts  ·  +R$ ${cash}${rec}`, rec ? 'good big' : 'good');
    persist();
  }

  function step(dt, inp) {
    const b = stats;
    for (const c of cars) stepCar(c, dt);

    if (crashed) {
      crashed -= dt;
      P.speed = Math.max(0, P.speed - 18 * dt);
      P.x += Math.sin(P.h) * P.speed * dt; P.z += Math.cos(P.h) * P.speed * dt;
      if (collideWorld(P.x, P.z, 0.6)) P.speed = 0;
      P.pitch = Math.max(0, P.pitch - 3 * dt);
      P.lean = lerp(P.lean, crashLean * 1.35, 1 - Math.exp(-dt * 8));
      if (crashed <= 0) respawn(true);
      return;
    }

    // velocidade
    const inGrau = P.pitch > 0.15;
    let acc = inp.throttle * b.accel * Math.max(0, 1 - P.speed / b.maxSpeed);
    acc -= inp.brake * (inGrau ? 5 : 13);
    acc -= 0.35 + P.speed * P.speed * 0.0016;
    P.speed = clamp(P.speed + acc * dt, 0, b.maxSpeed * 1.02);

    // direção
    const steerK = inGrau ? 0.55 : 1;
    const turn = inp.steer * steerK * 2.3 * clamp(P.speed / 5, 0, 1) / (1 + P.speed * 0.04);
    P.h -= turn * dt;
    P.lean = lerp(P.lean, -inp.steer * clamp(P.speed / 14, 0, 1) * 0.55 * steerK, 1 - Math.exp(-dt * 6));

    // empinada
    let tq = -GRAV * Math.cos(P.pitch + C0);
    if (P.speed > 2) tq += inp.pull * 14 * b.lift;
    tq += inp.throttle * 9 * b.lift * Math.max(0, 1 - P.speed / (b.maxSpeed * 1.08));
    if (P.pitch > 0.01) tq -= inp.brake * b.brakeT;
    if (P.pitch > 0.5) tq -= (P.pitch - BALANCE) * b.spring; // ajuda do upgrade de equilíbrio
    tq -= P.pitchVel * b.damp;
    P.pitchVel += tq * dt;
    P.pitch += P.pitchVel * dt;
    if (P.pitch <= 0) {
      if (P.pitchVel < -1.6) { shake = Math.max(shake, Math.min(0.4, -P.pitchVel * 0.12)); }
      P.pitch = 0; P.pitchVel = Math.max(0, P.pitchVel);
    }
    if (P.pitch > LOOP_OUT) { crash('PASSOU DO PONTO!'); return; }

    // posição + colisão
    const nx = P.x + Math.sin(P.h) * P.speed * dt, nz = P.z + Math.cos(P.h) * P.speed * dt;
    if (collideWorld(nx, nz, 0.6)) {
      if (P.speed > 7) { crash('BATEU!'); return; }
      P.speed = 0;
    } else { P.x = nx; P.z = nz; }

    // carros
    for (const c of cars) {
      const [cx, cz] = carXZ(c);
      const dx = P.x - cx, dz = P.z - cz;
      const along = c.axis === 'x' ? dx : dz, lat = c.axis === 'x' ? dz : dx;
      if (Math.abs(along) < 2.5 && Math.abs(lat) < 1.4) { crash('BATEU NO CARRO!'); return; }
      if (cur && cur.time > 0.4 && c.cutCd <= 0 && Math.abs(along) < 2.5 && Math.abs(lat) < 3.4 && P.speed > 6) {
        c.cutCd = 3; cur.cuts++; cur.points += 120 * cur.mult;
        toast(`RASPOU! +${120 * cur.mult}`, 'warn'); audio.blip(880, 0.15);
      }
    }

    // pontuação do grau
    if (inGrau) {
      if (!cur) cur = newGrau();
      const deg = P.pitch * DEG;
      const zone = deg >= 45 && deg <= 80;
      cur.time += dt; cur.dist += P.speed * dt; cur.maxSpeed = Math.max(cur.maxSpeed, P.speed);
      if (zone) cur.zone += dt;
      const prevMult = cur.mult;
      cur.mult = Math.min(10, 1 + Math.floor(cur.time / 3));
      if (cur.mult > prevMult) { toast(`x${cur.mult}`, 'warn'); audio.blip(440 + cur.mult * 40, 0.12); }
      const angF = zone ? 2 : deg > 20 ? 1 : 0.5;
      cur.points += dt * (4 + P.speed * 0.9) * angF * cur.mult;
      checkMission();
    } else if (cur && P.pitch === 0) {
      bankGrau();
    }

    // posição segura
    safeTimer += dt;
    if (safeTimer > 1 && P.speed > 1 && !inGrau) {
      safeTimer = 0;
      let ok = !collideWorld(P.x, P.z, 3);
      for (const c of cars) { const [cx, cz] = carXZ(c); if (Math.hypot(P.x - cx, P.z - cz) < 12) ok = false; }
      if (ok) lastSafe = { x: P.x, z: P.z, h: P.h };
    }

    // câmbio fictício (para som e HUD)
    const gears = 5, span = b.maxSpeed / gears;
    P.gear = Math.min(gears - 1, Math.floor(P.speed / span));
    const frac = (P.speed - P.gear * span) / span;
    const target = P.speed < 0.5 ? 0.12 + inp.throttle * 0.5 : 0.25 + frac * 0.75 + inp.throttle * 0.08;
    P.rpm = lerp(P.rpm, target, 1 - Math.exp(-dt * 10));
  }

  function stepCar(c, dt) {
    c.cutCd -= dt;
    // freia se o jogador estiver logo à frente na faixa
    const [cx, cz] = carXZ(c);
    const ahead = c.axis === 'x' ? (P.x - cx) * c.dir : (P.z - cz) * c.dir;
    const lat = c.axis === 'x' ? P.z - cz : P.x - cx;
    let target = c.base;
    if (ahead > 0 && ahead < 14 && Math.abs(lat) < 2.2 && !crashed) target = Math.min(target, Math.max(0, (ahead - 5) * 1.2));
    c.v = lerp(c.v, target, 1 - Math.exp(-dt * 2));
    c.t += c.v * c.dir * dt;
    const W = HALF + 12;
    if (c.t > W) c.t = -W; if (c.t < -W) c.t = W;
  }

  // ------------------------------------------------------------------
  // Câmera
  // ------------------------------------------------------------------
  const camPos = new T.Vector3(0, 5, -30), camLook = new T.Vector3();
  const CAM_NAMES = ['ATRÁS', 'LATERAL', 'ALTA', 'PRIMEIRA PESSOA'];
  let garageAng = 0;
  function updateCamera(dt) {
    const fx = Math.sin(P.h), fz = Math.cos(P.h);
    const bx = P.x, bz = P.z;
    let tp, tl, k = 1 - Math.exp(-dt * 5);
    if (state === 'garage' || state === 'menu') {
      garageAng += dt * (state === 'menu' ? 0.15 : 0.35);
      const r = state === 'menu' ? 7.5 : 4.2;
      tp = new T.Vector3(bx + Math.sin(garageAng) * r, state === 'menu' ? 2.6 : 1.6, bz + Math.cos(garageAng) * r);
      tl = new T.Vector3(bx + (state === 'garage' ? -fx * 0 + 0.8 : 0), 0.8, bz + fz * 0.7);
      k = 1 - Math.exp(-dt * 3);
    } else if (camMode === 0) {
      const back = 6.5 + P.speed * 0.06;
      tp = new T.Vector3(bx - fx * back, 2.6 + P.pitch * 0.8, bz - fz * back);
      tl = new T.Vector3(bx + fx * 3, 1.1 + P.pitch * 0.6, bz + fz * 3);
    } else if (camMode === 1) {
      tp = new T.Vector3(bx + fz * 6 + fx * 1.5, 1.4, bz - fx * 6 + fz * 1.5);
      tl = new T.Vector3(bx + fx * 0.8, 1.0, bz + fz * 0.8);
      k = 1 - Math.exp(-dt * 8);
    } else if (camMode === 2) {
      tp = new T.Vector3(bx - fx * 14, 11, bz - fz * 14);
      tl = new T.Vector3(bx + fx * 4, 0.5, bz + fz * 4);
    } else {
      // primeira pessoa: segue o capacete
      bikeParts.head.updateWorldMatrix(true, false);
      const hp = new T.Vector3(); bikeParts.head.getWorldPosition(hp);
      const dir = new T.Vector3(0, 0, 1).applyQuaternion(pitchPivot.getWorldQuaternion(new T.Quaternion()));
      tp = hp.clone().add(new T.Vector3(0, 0.12, 0));
      tl = hp.clone().addScaledVector(dir, 10).add(new T.Vector3(0, -1.2, 0));
      k = 1;
    }
    camPos.lerp(tp, k); camLook.lerp(tl, camMode === 3 && state === 'play' ? 1 : k);
    camera.position.copy(camPos);
    if (shake > 0) { camera.position.x += rand(-1, 1) * shake * 0.3; camera.position.y += rand(-1, 1) * shake * 0.3; shake = Math.max(0, shake - dt * 1.5); }
    camera.lookAt(camLook);
    const fov = 65 + (state === 'play' ? P.speed * 0.35 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = lerp(camera.fov, fov, k); camera.updateProjectionMatrix(); }
    bikeParts.head.visible = !(camMode === 3 && state === 'play');

    sun.position.set(P.x + 40, 70, P.z + 25); sun.target.position.set(P.x, 0, P.z);
  }

  // ------------------------------------------------------------------
  // Visual da moto
  // ------------------------------------------------------------------
  let brakeHeld = 0;
  function updateBikeVisual(dt, inp) {
    bikeRoot.position.set(P.x, 0, P.z);
    bikeRoot.rotation.y = P.h;
    leanGroup.rotation.z = P.lean;
    pitchPivot.rotation.x = -P.pitch;
    const spin = (P.speed / WR) * dt;
    bikeParts.rear.rotation.x += spin; bikeParts.front.rotation.x += spin * (P.pitch > 0.05 ? 0.985 : 1);
    // piloto compensa: inclina o tronco pra frente no grau, pra trás quando puxa
    const lean = P.pitch * 0.7 + (inp.pull ? -0.35 : 0) + (inp.throttle && P.pitch < 0.1 ? 0.12 : 0);
    bikeParts.torso.rotation.x = lerp(bikeParts.torso.rotation.x, lean + 0.2, 1 - Math.exp(-dt * 8));
    bikeParts.head.rotation.x = clamp(P.pitch - bikeParts.torso.rotation.x, -0.6, 0.6);
    brakeHeld = lerp(brakeHeld, inp.brake, 0.3);
    bikeParts.brakeLight.material.emissiveIntensity = 0.3 + brakeHeld * 2.5;
  }

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  const gctx = $('#gauge').getContext('2d');
  const mctx = $('#minimap').getContext('2d');
  function drawGauge(deg) {
    const c = gctx, W = 170, cx = 26, cy = 150, r = 120;
    c.clearRect(0, 0, W, W);
    const arc = (a0, a1, col, w) => { c.beginPath(); c.strokeStyle = col; c.lineWidth = w; c.arc(cx, cy, r, -a1 / DEG, -a0 / DEG); c.stroke(); };
    arc(0, 100, 'rgba(255,255,255,.08)', 16);
    arc(9, 45, 'rgba(255,178,30,.55)', 16);
    arc(45, 80, 'rgba(61,220,132,.9)', 16);
    arc(80, 95, 'rgba(255,77,77,.9)', 16);
    c.fillStyle = 'rgba(255,255,255,.5)'; c.font = '700 10px sans-serif';
    for (const t of [0, 45, 80]) { const a = -t / DEG; c.fillText(t + '°', cx + Math.cos(a) * (r - 30) - 8, cy + Math.sin(a) * (r - 30) + 4); }
    const a = -clamp(deg, 0, 100) / DEG;
    c.beginPath(); c.strokeStyle = deg > 80 ? '#ff4d4d' : '#fff'; c.lineWidth = 4; c.lineCap = 'round';
    c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6)); c.stroke();
    c.beginPath(); c.fillStyle = '#fff'; c.arc(cx, cy, 6, 0, Math.PI * 2); c.fill();
  }
  function drawMinimap() {
    const c = mctx, W = 180, sc = W / (N * S + RW + 8), o = W / 2;
    c.clearRect(0, 0, W, W);
    c.save();
    c.fillStyle = 'rgba(120,120,130,.35)';
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (isPlaza(i, j)) continue;
      c.fillRect(o + (roadLine(i) + RW / 2) * sc, o + (roadLine(j) + RW / 2) * sc, BW * sc, BW * sc);
    }
    c.fillStyle = 'rgba(255,178,30,.25)';
    c.fillRect(o + PLAZA_MIN * sc, o + PLAZA_MIN * sc, (PLAZA_MAX - PLAZA_MIN) * sc, (PLAZA_MAX - PLAZA_MIN) * sc);
    c.fillStyle = '#9ecbff';
    for (const car of cars) { const [x, z] = carXZ(car); c.fillRect(o + x * sc - 1.5, o + z * sc - 1.5, 3, 3); }
    // jogador
    c.translate(o + P.x * sc, o + P.z * sc); c.rotate(-P.h);
    c.fillStyle = '#ffb21e'; c.beginPath(); c.moveTo(0, 7); c.lineTo(4.5, -4); c.lineTo(-4.5, -4); c.closePath(); c.fill();
    c.restore();
  }
  let hudFrame = 0, hintTimer = 12;
  function updateHUD(dt) {
    hudFrame++;
    $('#speed').textContent = Math.round(P.speed * 3.6);
    $('#gear').textContent = P.speed < 0.5 ? 'N' : P.gear + 1 + 'ª';
    const deg = P.pitch * DEG;
    $('#angle').textContent = Math.round(deg) + '°';
    drawGauge(deg);
    $('#money').textContent = save.money.toLocaleString('pt-BR');
    $('#bestTime').textContent = save.best.time.toFixed(1);
    $('#bestDist').textContent = Math.round(save.best.dist);
    const cb = $('#combo');
    if (cur && cur.time > 0.25) {
      cb.classList.remove('hidden');
      $('#comboPts').textContent = Math.round(cur.points);
      $('#comboMult').textContent = 'x' + cur.mult;
      $('#comboInfo').textContent = `${cur.time.toFixed(1)}s · ${Math.round(cur.dist)}m${cur.cuts ? ' · ' + cur.cuts + ' raspada' + (cur.cuts > 1 ? 's' : '') : ''}`;
      $('#comboZone').classList.toggle('on', deg >= 45 && deg <= 80);
    } else cb.classList.add('hidden');
    if (hudFrame % 3 === 0) drawMinimap();
    if (hudFrame % 6 === 0) updateMissionUI();
    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('#keyhint').style.opacity = 0; }
  }

  // ------------------------------------------------------------------
  // Dia / noite
  // ------------------------------------------------------------------
  function applyTime() {
    const night = save.settings.night;
    const sky = night ? 0x0b1020 : 0xa9c7e8;
    scene.background = new T.Color(sky); scene.fog.color.set(sky);
    scene.fog.near = night ? 40 : 120; scene.fog.far = night ? 260 : 520;
    hemi.intensity = night ? 0.18 : 0.75;
    hemi.color.set(night ? 0x6c7cff : 0xcfe3ff);
    sun.intensity = night ? 0.15 : 1.6;
    sun.color.set(night ? 0x8899ff : 0xfff2dd);
    nightMats.windows.emissiveIntensity = night ? 1.0 : 0;
    nightMats.lamps.emissiveIntensity = night ? 2.0 : 0;
    nightMats.carFront.emissiveIntensity = night ? 3 : 0.2;
    nightMats.carRear.emissiveIntensity = night ? 2 : 0.3;
    headlight.intensity = night ? 3.5 : 0;
    if (bikeParts) bikeParts.lens.material.emissiveIntensity = night ? 3 : 0.6;
  }
  applyTime();

  // ------------------------------------------------------------------
  // Telas / garagem
  // ------------------------------------------------------------------
  const screens = ['menu', 'pause', 'help', 'garage'];
  let backTo = 'menu';
  function show(name) {
    for (const s of screens) $('#' + s).classList.toggle('hidden', s !== name);
  }
  function setState(s) {
    state = s;
    if (s === 'play') { show(null); stats = computeStats(); }
    else if (s === 'paused') show('pause');
    else if (s === 'menu') { show('menu'); $('#menuMoney').textContent = `R$ ${save.money.toLocaleString('pt-BR')} · missão #${save.mission + 1}`; }
    else if (s === 'garage') { show('garage'); renderGarage(); }
    else if (s === 'help') show('help');
    const inRun = s === 'play' || s === 'paused' || (s === 'help' && backTo === 'paused');
    $('#hud').classList.toggle('hidden', !inRun);
  }

  let gSel = save.current;
  function renderGarage() {
    $('#gMoney').textContent = save.money.toLocaleString('pt-BR');
    const list = $('#bikeList'); list.innerHTML = '';
    for (const b of BIKES) {
      const owned = save.owned.includes(b.id);
      const btn = document.createElement('button');
      btn.className = 'bikeCard' + (b.id === gSel ? ' sel' : '');
      btn.innerHTML = `<div class="n">${b.name}</div><div class="p ${owned ? 'own' : ''}">${b.id === save.current ? 'EM USO' : owned ? 'SUA' : 'R$ ' + b.price.toLocaleString('pt-BR')}</div>`;
      btn.onclick = () => { gSel = b.id; previewBike(b); renderGarage(); };
      list.appendChild(btn);
    }
    const b = bikeDef(gSel), owned = save.owned.includes(b.id), u = ups(b.id);
    const max = { s: 46 * 1.3, a: 15 * 1.4, l: 1.3, st: 1.35 * 1.5 };
    const statRow = (n, v, m) => `<div class="stat"><span>${n}</span><div class="bar"><div style="width:${clamp((v / m) * 100, 4, 100)}%"></div></div></div>`;
    let html = `<div class="sectionT">${b.name.toUpperCase()}</div>`;
    html += statRow('Velocidade', b.maxSpeed * (1 + u.motor * 0.06), max.s);
    html += statRow('Aceleração', b.accel * (1 + u.motor * 0.08), max.a);
    html += statRow('Força do grau', b.lift, max.l);
    html += statRow('Estabilidade', b.stab * (1 + u.equi * 0.2), max.st);
    if (!owned) {
      html += `<button id="buyBike" class="primary" ${save.money < b.price ? 'disabled' : ''}>COMPRAR · R$ ${b.price.toLocaleString('pt-BR')}</button>`;
    } else {
      if (save.current !== b.id) html += `<button id="useBike" class="primary">USAR ESTA MOTO</button>`;
      html += `<div class="sectionT">MELHORIAS</div>`;
      for (const up of UPG) {
        const lvl = u[up.id], cost = upgCost(b, lvl), full = lvl >= UPG_MAX;
        html += `<div class="upg"><div><div class="t">${up.name}</div><div class="d">${up.desc}</div>
          <div class="pips">${Array.from({ length: UPG_MAX }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
          <button data-up="${up.id}" ${full || save.money < cost ? 'disabled' : ''}>${full ? 'MÁX' : 'R$ ' + cost.toLocaleString('pt-BR')}</button></div>`;
      }
      html += `<div class="sectionT">PINTURA</div><div class="swatches">${COLORS.map((c) => `<button class="swatch ${bikeColor(b) === c ? 'sel' : ''}" data-col="${c}" style="background:${c}"></button>`).join('')}</div>`;
    }
    const det = $('#bikeDetail'); det.innerHTML = html;
    const buy = $('#buyBike');
    if (buy) buy.onclick = () => { if (save.money >= b.price) { save.money -= b.price; save.owned.push(b.id); save.current = b.id; persist(); audio.blip(520, 0.3); renderGarage(); } };
    const use = $('#useBike');
    if (use) use.onclick = () => { save.current = b.id; persist(); renderGarage(); };
    det.querySelectorAll('[data-up]').forEach((el) => (el.onclick = () => {
      const id = el.dataset.up, cost = upgCost(b, u[id]);
      if (save.money >= cost && u[id] < UPG_MAX) { save.money -= cost; u[id]++; persist(); audio.blip(600, 0.2); renderGarage(); }
    }));
    det.querySelectorAll('[data-col]').forEach((el) => (el.onclick = () => {
      save.colors[b.id] = el.dataset.col; persist(); previewBike(b); renderGarage();
    }));
  }
  function previewBike(b) { buildBike(b); applyTime(); }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    audio.resume();
    const act = el.dataset.act;
    if (act === 'play' || act === 'resume') { if (act === 'play') { hintTimer = 12; $('#keyhint').style.opacity = 1; } setState('play'); }
    else if (act === 'garage') { backTo = state === 'paused' ? 'paused' : 'menu'; gSel = save.current; setState('garage'); }
    else if (act === 'help') { backTo = state; setState('help'); }
    else if (act === 'back') {
      if (state === 'garage') { buildBike(bikeDef(save.current)); applyTime(); stats = computeStats(); }
      setState(backTo === 'help' ? 'menu' : backTo);
    }
    else if (act === 'night') { save.settings.night = !save.settings.night; persist(); applyTime(); }
    else if (act === 'sound') { save.settings.sound = !save.settings.sound; persist(); $('#soundState').textContent = save.settings.sound ? 'LIGADO' : 'DESLIGADO'; }
    else if (act === 'reset') {
      if (confirm('Apagar todo o progresso (dinheiro, motos, missões)?')) {
        save = defaultSave(); persist(); mission = missionAt(0); buildBike(bikeDef(save.current)); applyTime(); stats = computeStats(); respawn(false); setState('menu');
      }
    }
  });
  $('#soundState').textContent = save.settings.sound ? 'LIGADO' : 'DESLIGADO';

  // ------------------------------------------------------------------
  // Loop principal
  // ------------------------------------------------------------------
  const FIXED = 1 / 120;
  let acc = 0, last = performance.now();
  const idleInput = { throttle: 0, brake: 0, steer: 0, pull: 0 };
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let inp = readInput();

    if (once.has('Escape')) {
      if (state === 'play') setState('paused');
      else if (state === 'paused') setState('play');
      else if (state === 'help' || state === 'garage') $('#' + (state === 'help' ? 'help' : 'garage') + ' [data-act="back"]').click();
    }
    if (state === 'play') {
      if (once.has('KeyC')) { camMode = (camMode + 1) % 4; save.settings.cam = camMode; persist(); toast('Câmera: ' + CAM_NAMES[camMode]); }
      if (once.has('KeyR')) respawn(true);
      if (once.has('KeyN')) { save.settings.night = !save.settings.night; persist(); applyTime(); }
      if (once.has('KeyM')) { save.settings.sound = !save.settings.sound; persist(); toast(save.settings.sound ? 'Som ligado' : 'Som desligado'); }
    }
    once.clear();

    if (state !== 'play') inp = idleInput;
    if (state === 'play' || state === 'paused') {
      if (state === 'play') {
        acc += dt;
        while (acc >= FIXED) { step(FIXED, inp); acc -= FIXED; }
      }
    } else {
      // menu/garagem: moto parada, trânsito segue
      for (const c of cars) stepCar(c, dt);
    }
    for (const c of cars) { const [x, z] = carXZ(c); c.mesh.position.set(x, 0, z); }
    updateBikeVisual(dt, inp);
    updateCamera(dt);
    if (state === 'play') updateHUD(dt);
    audio.update(P.rpm, inp.throttle, P.speed, state === 'play' && !crashed);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  setState('menu');
  updateMissionUI();
  requestAnimationFrame(frame);

  // ganchos para testes automatizados
  window.__grau = { P, get state() { return state; }, get cur() { return cur; }, save: () => save, step, setState };
})();
