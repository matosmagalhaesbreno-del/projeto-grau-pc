// Manobras e combos: grau, ponto de equilíbrio, rabeta, stoppie, grau de giro, corte, burnout.
const DEG = 180 / Math.PI;

export class Tricks {
  constructor() {
    this.combo = null;
    this.idle = 0;
    this.events = [];
    this.best = { time: 0, dist: 0, combo: 0 };
  }

  emit(text, cls, sound) { this.events.push({ text, cls, sound }); }

  start() {
    this.combo = { points: 0, mult: 1, tricks: new Set(), time: 0, dist: 0, balance: 0, rabeta: 0, stoppie: 0, turn: 0, cuts: 0, maxSpeed: 0, clutch: 0, burnout: 0, grau: { time: 0, dist: 0 }, cur: '' };
  }

  addTrick(name) {
    const c = this.combo;
    if (!c.tricks.has(name)) {
      c.tricks.add(name);
      c.mult = Math.min(12, c.mult + 1);
      this.emit(name, 'trick', 'trick');
    }
  }

  // chamado a cada passo de física
  update(dt, P, ctx) {
    const pitchDeg = P.pitch * DEG;
    const bal = P.balanceAngle;
    const wheelie = P.pitch > 0.14;
    const stoppie = P.pitch < -0.08;
    const burnout = P.v < 3 && P.spin > 0.6 && P.brakingF > 0.5;
    const active = wheelie || stoppie || burnout || P.tail;
    if (active) {
      if (!this.combo) this.start();
      const c = this.combo;
      this.idle = 0;
      const speedF = 1 + Math.min(2, P.v / 15);
      let rate = 0;
      if (wheelie) {
        c.time += dt; c.dist += P.v * dt; c.grau.time += dt; c.grau.dist += P.v * dt;
        c.maxSpeed = Math.max(c.maxSpeed, P.v);
        rate = 18 * speedF;
        const nearBal = Math.abs(P.pitch - bal) < 0.1;
        if (nearBal) { c.balance += dt; rate *= 2.2; c.cur = 'NO PONTO'; if (c.balance > 1.2) this.addTrick('PONTO DE EQUILÍBRIO'); }
        else c.cur = pitchDeg > 25 ? 'GRAU' : 'GRAU BAIXO';
        if (P.tail) { c.rabeta += dt; rate *= 3; c.cur = 'RABETA'; if (c.rabeta > 0.3) this.addTrick('RABETA NO CHÃO'); }
        if (Math.abs(P.yawRate) > 0.3) { c.turn += Math.abs(P.yawRate) * dt * DEG; if (c.turn > 45) this.addTrick('GRAU DE GIRO'); }
        if (c.grau.time > 2) this.addTrick('GRAU');
        if (P.v * 3.6 > 100 && c.grau.time > 1) this.addTrick('GRAU A 100+');
        if (c.grau.time > 10) this.addTrick('GRAU LONGO');
      }
      if (stoppie) { c.stoppie += dt; rate = 26 * speedF; c.cur = 'STOPPIE'; if (c.stoppie > 0.6) this.addTrick('STOPPIE'); }
      if (burnout) { c.burnout += dt; rate = 14; c.cur = 'BURNOUT'; if (c.burnout > 1.5) this.addTrick('BURNOUT'); }
      if (P.clutchPop > 0 && wheelie && !c.clutch) { c.clutch = 1; this.addTrick('GRAU DE EMBREAGEM'); }
      c.points += rate * dt * c.mult;
    } else if (this.combo) {
      this.idle += dt;
      this.combo.cur = '';
      if (this.idle > 1.6) this.bank(ctx);
    }
  }

  cut(car) {
    const c = this.combo;
    if (!c || car.cutCd > 0) return;
    car.cutCd = 3;
    c.cuts++;
    const pts = 150 * c.mult;
    c.points += pts;
    this.addTrick('CORTE');
    this.emit(`CORTE! +${pts}`, 'cut', 'cut');
  }

  landed(rate) {
    if (!this.combo || this.combo.grau.time < 1) return;
    if (rate < 1.0) { const b = Math.round(60 * this.combo.mult); this.combo.points += b; this.emit(`POUSO LIMPO +${b}`, 'good'); }
    this.combo.grau = { time: 0, dist: 0 };
  }

  bank(ctx) {
    const c = this.combo;
    this.combo = null;
    this.idle = 0;
    if (!c || c.points < 20) return;
    const pts = Math.round(c.points);
    const cash = Math.round(pts * 2.2);
    let rec = '';
    if (c.time > this.best.time) { this.best.time = c.time; rec = ' · RECORDE'; }
    if (c.dist > this.best.dist) { this.best.dist = c.dist; rec = ' · RECORDE'; }
    if (pts > this.best.combo) this.best.combo = pts;
    this.emit(`+${pts.toLocaleString('pt-BR')} pts  ·  R$ ${cash.toLocaleString('pt-BR')}${rec}`, rec ? 'record' : 'bank', 'bank');
    ctx && ctx.onBank && ctx.onBank(pts, cash, c);
  }

  fail() {
    if (this.combo && this.combo.points > 30) this.emit('COMBO PERDIDO', 'bad');
    this.combo = null;
  }
}
