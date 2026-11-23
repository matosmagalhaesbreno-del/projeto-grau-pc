// Interface: HUD, menus, garagem, configurações e minimapa.
import { BIKES, PAINTS, RIDER_COLORS, UPGRADES, upgradeCost } from '../game/data.js';
import { QUALITY } from '../core/renderer.js';
import { XS, AVX, ZS, SW, AVW, BEACH_X0, SAND_X0, Z_MIN, Z_MAX, X_MIN } from '../world/city.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');

export class UI {
  constructor() {
    this.screens = ['menu', 'pause', 'garage', 'settings', 'controls', 'loading'];
    this.stack = [];
    // arcos do conta-giros
    const svg = $('#tach');
    svg.insertAdjacentHTML('afterbegin', '<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#2ee6c9"/><stop offset="0.6" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ff4f8b"/></linearGradient></defs>');
    this.arc0 = -225; this.arc1 = 45;
    $('#tachBg').setAttribute('d', this.arcPath(0, 1));
    this.mm = $('#minimap').getContext('2d');
    this.buildMinimapBase();
    this.hintT = 14;
  }

  arcPath(f0, f1) {
    const cx = 110, cy = 110, r = 96;
    const a0 = (this.arc0 + (this.arc1 - this.arc0) * f0) * Math.PI / 180, a1 = (this.arc0 + (this.arc1 - this.arc0) * f1) * Math.PI / 180;
    const p = (a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }

  show(name) {
    for (const s of this.screens) document.getElementById(s).classList.toggle('show', s === name);
    this.current = name;
  }

  setHud(on) { $('#hud').classList.toggle('hidden', !on); }

  loading(frac, text) {
    $('#loadFill').style.width = (frac * 100).toFixed(0) + '%';
    if (text) $('#loadText').textContent = text;
  }

  feed(text, cls = 'info') {
    const d = document.createElement('div');
    d.className = 'fi ' + cls;
    d.textContent = text;
    const f = $('#feed');
    f.appendChild(d);
    while (f.children.length > 5) f.firstChild.remove();
    setTimeout(() => d.remove(), 1900);
  }

  crash(text) {
    const c = $('#crash');
    if (!text) { c.classList.add('hidden'); return; }
    c.textContent = text;
    c.classList.remove('hidden');
  }

  // -----------------------------------------------------------------
  updateHud(dt, s) {
    $('#spd').textContent = Math.round(s.speed * 3.6);
    $('#gear').textContent = s.speed < 0.3 && s.throttle < 0.05 ? 'N' : s.gear;
    $('#rpm').textContent = fmt(Math.round(s.rpm / 50) * 50) + ' rpm';
    const f = Math.min(1, s.rpm / (s.redline * 1.05));
    $('#tachFill').setAttribute('d', this.arcPath(0, Math.max(0.005, f)));
    if (this._red !== s.redline) { this._red = s.redline; $('#tachRed').setAttribute('d', this.arcPath(0.88 / 1.05 * 1.0, 1)); }
    $('#shiftLight').classList.toggle('on', s.rpm > s.redline * 0.93);
    // ângulo: -30° a 90°
    const map = (deg) => ((deg + 30) / 120) * 170;
    $('#angleNeedle').style.bottom = Math.max(0, Math.min(170, map(s.pitchDeg))) - 2 + 'px';
    $('#angleBal').style.bottom = map(s.balanceDeg) - 1 + 'px';
    $('#angleTail').style.bottom = map(s.tailDeg) - 1 + 'px';
    $('#angleDeg').textContent = Math.round(s.pitchDeg) + '°';
    $('#money').textContent = 'R$ ' + fmt(s.money);
    const h = Math.floor(s.hour), m = Math.floor((s.hour - h) * 60);
    $('#clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    // combo
    const c = s.combo, cb = $('#combo');
    if (c && c.points > 1) {
      cb.classList.add('on');
      $('#cPts').textContent = fmt(c.points);
      $('#cMult').textContent = 'x' + c.mult;
      $('#cTrick').textContent = c.cur || '';
      $('#cInfo').textContent = `${c.time.toFixed(1)} s · ${Math.round(c.dist)} m${c.cuts ? ' · ' + c.cuts + ' corte' + (c.cuts > 1 ? 's' : '') : ''}`;
    } else cb.classList.remove('on');
    // missão
    if (s.mission) {
      $('#mNum').textContent = '#' + (s.mission.index + 1);
      $('#mText').textContent = s.mission.text;
      $('#mBar').style.width = Math.min(100, (s.missionProgress / s.mission.goal) * 100) + '%';
    }
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) $('#hint').style.opacity = 0; }
    const fpsEl = $('#fps');
    fpsEl.classList.toggle('hidden', !s.showFps);
    if (s.showFps) fpsEl.textContent = `${Math.round(s.fps)} FPS · ${s.drawCalls} draws · ${(s.tris / 1e6).toFixed(2)}M tris · res ${Math.round(s.resScale * 100)}%`;
  }

  resetHint() { this.hintT = 14; $('#hint').style.opacity = 1; }

  // -----------------------------------------------------------------
  buildMinimapBase() {
    const W = 900, H = 1000;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    this.mmScale = W / (SAND_X0 + 120 - (X_MIN - 60));
    this.mmOx = X_MIN - 60; this.mmOz = Z_MIN - 50;
    const P = (wx, wz) => [(wx - this.mmOx) * this.mmScale, (wz - this.mmOz) * this.mmScale];
    x.fillStyle = '#1b2a1c'; x.fillRect(0, 0, W, H);
    // mar e areia
    const [sx] = P(SAND_X0, 0), [bx] = P(BEACH_X0, 0);
    x.fillStyle = '#d9c49a'; x.fillRect(sx, 0, W, H);
    x.fillStyle = '#145a73'; x.fillRect(P(SAND_X0 + 34, 0)[0], 0, W, H);
    x.fillStyle = '#9a9a9a'; x.fillRect(bx, 0, sx - bx, H);
    // quadras
    x.fillStyle = '#3a3f48';
    const [x0, z0] = P(X_MIN, Z_MIN), [x1, z1] = P(BEACH_X0, Z_MAX);
    x.fillRect(x0, z0, x1 - x0, z1 - z0);
    // ruas
    x.fillStyle = '#c9ccd2';
    for (const xx of [...XS, AVX]) { const w = (xx === AVX ? AVW : SW) * this.mmScale; const [px] = P(xx, 0); x.fillRect(px - w / 2, z0, w, z1 - z0); }
    for (const zz of ZS) { const w = SW * this.mmScale; const [, pz] = P(0, zz); x.fillRect(x0, pz - w / 2, P(AVX, 0)[0] - x0, w); }
    this.mmBase = c;
  }

  minimap(P, cars, heading) {
    const ctx = this.mm, R = 100;
    ctx.clearRect(0, 0, 200, 200);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.clip();
    ctx.translate(R, R);
    ctx.rotate(Math.PI + heading);
    const zoom = 0.9;
    ctx.scale(zoom, zoom);
    const px = (P.x - this.mmOx) * this.mmScale, pz = (P.z - this.mmOz) * this.mmScale;
    ctx.drawImage(this.mmBase, -px, -pz);
    ctx.fillStyle = '#ffd36b';
    for (const c of cars) {
      const cx = (c.x - this.mmOx) * this.mmScale - px, cz = (c.z - this.mmOz) * this.mmScale - pz;
      if (Math.abs(cx) > 70 || Math.abs(cz) > 70) continue;
      ctx.fillRect(cx - 1.2, cz - 1.2, 2.4, 2.4);
    }
    ctx.restore();
    // jogador
    ctx.fillStyle = '#ff4f8b';
    ctx.beginPath(); ctx.moveTo(R, R - 9); ctx.lineTo(R + 6, R + 7); ctx.lineTo(R, R + 3); ctx.lineTo(R - 6, R + 7); ctx.closePath(); ctx.fill();
  }

  // -----------------------------------------------------------------
  renderGarage(save, sel, cb) {
    $('#gMoney').textContent = 'R$ ' + fmt(save.money);
    const list = $('#bikeList');
    list.innerHTML = '';
    for (const b of BIKES) {
      const own = save.owned.includes(b.key);
      const el = document.createElement('button');
      el.className = 'bk' + (b.key === sel ? ' sel' : '');
      el.innerHTML = `<div class="b">${b.brand.toUpperCase()}</div><div class="n">${b.name}</div><div class="p ${own ? 'own' : ''}">${b.key === save.current ? 'EM USO' : own ? 'NA GARAGEM' : 'R$ ' + fmt(b.price)}</div>`;
      el.onclick = () => cb.select(b.key);
      list.appendChild(el);
    }
    const b = BIKES.find((x) => x.key === sel);
    const own = save.owned.includes(b.key);
    const bs = save.bikes[b.key] || { upgrades: {} };
    let h = `<div class="sect">${b.brand.toUpperCase()} ${b.name.toUpperCase()}</div>
      <div class="specs">
        <div class="spec"><b>${b.hp}</b><span>CV</span></div>
        <div class="spec"><b>${b.nm}</b><span>NM</span></div>
        <div class="spec"><b>${b.cc}</b><span>CC</span></div>
        <div class="spec"><b>${b.top}</b><span>KM/H MÁX</span></div>
        <div class="spec"><b>${b.kg}</b><span>KG</span></div>
        <div class="spec"><b>${b.gears}</b><span>MARCHAS</span></div>
        <div class="spec"><b>${fmt(b.redline)}</b><span>RPM MÁX</span></div>
        <div class="spec"><b>${b.cyl}</b><span>CILINDROS</span></div>
      </div>`;
    if (!own) {
      h += `<button id="buy" class="primary" ${save.money < b.price ? 'disabled' : ''}>COMPRAR · R$ ${fmt(b.price)}</button>`;
      if (save.money < b.price) h += `<div class="dim small">Faltam R$ ${fmt(b.price - save.money)}. Faça combos e missões para ganhar dinheiro.</div>`;
    } else {
      if (save.current !== b.key) h += `<button id="use" class="primary">PILOTAR ESTA MOTO</button>`;
      h += '<div class="sect">PREPARAÇÃO</div>';
      for (const u of UPGRADES) {
        const lvl = (bs.upgrades || {})[u.id] || 0, cost = upgradeCost(b, u, lvl), full = lvl >= u.max;
        h += `<div class="upg"><div><div class="t">${u.name}</div><div class="d">${u.desc}</div><div class="pips">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
          <button data-up="${u.id}" ${full || save.money < cost ? 'disabled' : ''}>${full ? 'MÁXIMO' : 'R$ ' + fmt(cost)}</button></div>`;
      }
      h += `<div class="sect">PINTURA</div><div class="sw">${PAINTS.map((c) => `<button data-paint="${c}" class="${(bs.paint || '') === c ? 'sel' : ''}" style="background:${c}"></button>`).join('')}</div>`;
      h += `<div class="sect">RODAS</div><div class="sw">${['#0b0b0d', '#c9ccd0', '#c8901e', '#1446b8', '#c4162a', '#f2f2f2'].map((c) => `<button data-rim="${c}" class="${(bs.rim || '') === c ? 'sel' : ''}" style="background:${c}"></button>`).join('')}</div>`;
    }
    h += `<div class="sect">PILOTO</div><div class="dim small">Jaqueta</div><div class="sw">${RIDER_COLORS.map((c) => `<button data-jacket="${c}" class="${save.rider.jacket === c ? 'sel' : ''}" style="background:${c}"></button>`).join('')}</div>
      <div class="dim small">Capacete</div><div class="sw">${RIDER_COLORS.map((c) => `<button data-helmet="${c}" class="${save.rider.helmet === c ? 'sel' : ''}" style="background:${c}"></button>`).join('')}</div>
      <div class="sect">PLACA</div><div class="row"><input id="plate" type="text" maxlength="7" value="${save.plate}"><button id="plateOk">APLICAR</button></div>`;
    const info = $('#bikeInfo');
    info.innerHTML = h;
    const q = (s) => info.querySelector(s);
    if (q('#buy')) q('#buy').onclick = () => cb.buy(b.key);
    if (q('#use')) q('#use').onclick = () => cb.use(b.key);
    info.querySelectorAll('[data-up]').forEach((e) => (e.onclick = () => cb.upgrade(b.key, e.dataset.up)));
    info.querySelectorAll('[data-paint]').forEach((e) => (e.onclick = () => cb.paint(b.key, e.dataset.paint)));
    info.querySelectorAll('[data-rim]').forEach((e) => (e.onclick = () => cb.rim(b.key, e.dataset.rim)));
    info.querySelectorAll('[data-jacket]').forEach((e) => (e.onclick = () => cb.rider('jacket', e.dataset.jacket)));
    info.querySelectorAll('[data-helmet]').forEach((e) => (e.onclick = () => cb.rider('helmet', e.dataset.helmet)));
    q('#plateOk').onclick = () => cb.plate(q('#plate').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) || 'GRA2U26');
    q('#plate').addEventListener('keydown', (e) => e.stopPropagation());
  }

  renderSettings(st, cb) {
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-k="${key}" data-v="${v}" class="${String(st[key]) === String(v) ? 'sel' : ''}">${l}</button>`).join('')}</div>`;
    const range = (key, min, max, step) => `<input type="range" data-r="${key}" min="${min}" max="${max}" step="${step}" value="${st[key]}">`;
    const row = (label, help, ctl) => `<div class="set"><label>${label}<div class="h">${help}</div></label>${ctl}</div>`;
    let h = '<div class="sect">GRÁFICOS</div>';
    h += row('Qualidade', 'Sombras, oclusão, reflexos e detalhes', seg('quality', Object.entries(QUALITY).map(([k, q]) => [k, q.label])));
    h += row('FPS alvo', 'A resolução dinâmica segura esse valor. "Livre" tira o limite no app desktop.', seg('fpsTarget', [[60, '60'], [144, '144'], [165, '165'], [240, '240'], [0, 'Livre']]));
    h += row('Resolução dinâmica', 'Reduz a resolução interna quando o FPS cai', seg('dynamicRes', [[true, 'Ligada'], [false, 'Desligada']]));
    h += row('Escala de resolução', 'Multiplicador da resolução interna', range('renderScale', 0.5, 1, 0.05));
    h += row('Motion blur', 'Desfoque de movimento por velocidade', range('motionBlur', 0, 1.5, 0.1));
    h += row('Mostrar FPS', 'Também com F3', seg('showFps', [[true, 'Sim'], [false, 'Não']]));
    if (window.desktop) h += row('VSync (app desktop)', 'Ligado: segue a taxa do monitor (240 Hz = 240 fps). Desligado: FPS livre. Requer reiniciar o jogo.', seg('vsync', [[true, 'Ligado'], [false, 'Desligado']]));
    h += '<div class="sect">MUNDO</div>';
    h += row('Horário', 'Hora do dia', range('hour', 0, 24, 0.25));
    h += row('Passagem do tempo', '', seg('timeScale', [[0, 'Parado'], [0.01, 'Lento'], [0.04, 'Normal'], [0.2, 'Rápido']]));
    h += row('Nuvens', '', range('clouds', 0, 0.9, 0.05));
    h += row('Trânsito', 'Quantidade de carros (aplica ao reiniciar)', seg('traffic', [[30, 'Pouco'], [70, 'Médio'], [120, 'Muito']]));
    h += '<div class="sect">PILOTAGEM</div>';
    h += row('Assistência', 'Assistido: jogar o corpo para trás ajuda a empinar. Simulação: só física.', seg('assist', [[1, 'Assistido'], [0, 'Simulação']]));
    h += row('Câmbio', 'Manual: Z/X trocam a marcha', seg('autoGear', [[true, 'Automático'], [false, 'Manual']]));
    h += '<div class="sect">ÁUDIO</div>';
    h += row('Volume', '', range('volume', 0, 1, 0.05));
    const body = $('#settingsBody');
    body.innerHTML = h;
    body.querySelectorAll('[data-k]').forEach((e) => (e.onclick = () => {
      let v = e.dataset.v;
      if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(+v)) v = +v;
      cb.set(e.dataset.k, v);
    }));
    body.querySelectorAll('[data-r]').forEach((e) => (e.oninput = () => cb.set(e.dataset.r, +e.value, true)));
  }
}
