// Física da moto: motor/embreagem/marchas, tração, grau (empinada) como corpo rígido girando
// no contato traseiro, rabeta raspando, stoppie no contato dianteiro, inclinação em curvas.
const G = 9.81, RHO = 1.2, ETA = 0.88, RIDER = 75;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const GEAR_REL = {
  5: [3.09, 1.88, 1.40, 1.12, 0.92],
  6: [2.60, 1.95, 1.60, 1.38, 1.22, 1.10],
};

export class BikePhysics {
  constructor(spec, geo, ups = {}, opts = {}) {
    this.spec = spec;
    this.geo = geo;
    this.assist = opts.assist !== undefined ? opts.assist : 1; // 0 simulação, 1 assistido
    this.autoGear = opts.autoGear !== false;
    this.configure(ups);
    this.reset(0, 0, 0);
  }

  configure(ups) {
    const s = this.spec, g = this.geo;
    this.ups = ups;
    const pw = 1 + 0.05 * (ups.motor || 0) + 0.04 * (ups.escape || 0);
    this.m = s.kg + RIDER;
    this.L = g.wheelbase;
    this.r = g.rRear;
    this.rf = g.rFront;
    const style = g.style;
    this.b0 = this.L * ({ sport: 0.5, naked: 0.49, commuter: 0.47, trail: 0.47, adventure: 0.48 }[style] || 0.48);
    this.h0 = { sport: 0.64, naked: 0.66, commuter: 0.66, trail: 0.72, adventure: 0.72 }[style] || 0.66;
    this.Ip = this.m * (0.42 * 0.42 + this.b0 * this.b0 + this.h0 * this.h0);
    this.P = s.hp * 735.5 * pw;
    this.Tn = s.nm * pw;
    this.wRed = s.redline * Math.PI / 30;
    this.wIdle = s.idle * Math.PI / 30;
    // torque coerente com a potência declarada no regime de potência máxima
    this.Thp = this.P / (s.hpRpm * Math.PI / 30);
    const vTop = s.top / 3.6;
    const rel = GEAR_REL[s.gears] || GEAR_REL[6];
    const overallTop = (this.wRed * this.r / vTop) * 0.985;
    const shortK = 1 + 0.07 * (ups.relacao || 0);
    this.ratios = rel.map((x) => overallTop * (x / rel[rel.length - 1]) * shortK);
    const crr = 0.018;
    this.crr = crr;
    this.CdA = Math.max(0.15, 2 * (this.P * ETA / vTop - crr * this.m * G) / (RHO * vTop * vTop));
    this.mu = s.mu * (1 + 0.06 * (ups.pneus || 0));
    this.damp = 1.6 + 0.6 * (ups.suspensao || 0);
    this.Ie = this.Tn / (this.wRed / (s.cyl >= 3 ? 0.55 : 0.42)); // inércia do motor (rev livre ~0,5 s)
    this.clutchCap = this.Tn * 2.6;
    this.tailAngle = g.tailAngle || 1.3;
  }

  reset(x, z, h) {
    Object.assign(this, {
      x, z, y: 0, h, v: 0, a: 0, lean: 0, leanRate: 0, pitch: 0, pitchRate: 0, yawRate: 0, steer: 0,
      gear: 1, wE: this.wIdle, wR: 0, wF: 0, clutch: 1, throttle: 0, rpmCut: 0, shiftTimer: 0,
      tail: false, stoppie: false, spin: 0, sinkSpeed: 0, susF: 0, susR: 0, bodyLean: 0,
      crashed: null, clutchPop: 0, popStrength: 0, lastSurface: 'road', curbBump: 0, scrapePeg: 0, wheelieTime: 0,
      airborne: false, limiter: false, brakingF: 0, brakingR: 0, surfaceH: 0, fbIn: 0, rbIn: 0,
    });
  }

  torque(w) {
    const s = this.spec;
    const rpm = w * 30 / Math.PI;
    const k1 = smooth(s.idle, s.nmRpm, rpm);
    const k2 = smooth(s.nmRpm, s.hpRpm, rpm);
    const k3 = smooth(s.hpRpm, s.redline, rpm);
    const t0 = this.Tn * 0.55, t1 = this.Tn, t2 = this.Thp, t3 = this.Thp * 0.86;
    return rpm < s.nmRpm ? lerp(t0, t1, k1) : rpm < s.hpRpm ? lerp(t1, t2, k2) : lerp(t2, t3, k3);
  }

  get rpm() { return this.wE * 30 / Math.PI; }
  get balanceAngle() { return Math.atan2(this.b0 + 0.11 * this.bodyLean, this.h0 - 0.03 * Math.abs(this.bodyLean)); }

  shift(d) {
    const n = this.ratios.length;
    const g = clamp(this.gear + d, 1, n);
    if (g !== this.gear) { this.gear = g; this.shiftTimer = 0.12; this.onShift && this.onShift(d); }
  }

  step(dt, inp, world) {
    if (this.crashed) return;
    const s = this.spec;
    // ---------------- entradas suavizadas ----------------
    const thrTarget = inp.throttle;
    this.throttle += clamp(thrTarget - this.throttle, -dt * 8, dt * (inp.analog ? 30 : 5.5));
    let thr = this.throttle;
    this.bodyLean = lerp(this.bodyLean, inp.lean, 1 - Math.exp(-dt * 7));
    this.fbIn = this.fbIn || 0; this.rbIn = this.rbIn || 0;
    this.fbIn += clamp(inp.frontBrake - this.fbIn, -dt * 10, dt * (inp.analog ? 30 : 4));
    this.rbIn += clamp(inp.rearBrake - this.rbIn, -dt * 10, dt * (inp.analog ? 30 : 7));
    let frontBrake = this.fbIn;
    const rearBrake = this.rbIn;
    if (this.assist && this.pitch < -0.2) frontBrake *= clamp(1 - (-this.pitch - 0.2) / 0.25, 0, 1);
    this.brakingF = frontBrake; this.brakingR = rearBrake;

    // ---------------- câmbio ----------------
    const n = this.ratios.length;
    if (this.shiftTimer > 0) { this.shiftTimer -= dt; thr *= 0.15; }
    const rpm = this.rpm;
    if (this.autoGear && this.shiftTimer <= 0 && this.clutch > 0.9) {
      const vSpeed = this.v;
      if (rpm > s.redline * 0.94 && this.gear < n && thr > 0.3 && this.wR * this.r < vSpeed * 1.25) this.shift(1);
      else if (this.gear > 1) {
        const rpmDown = (this.v / this.r) * this.ratios[this.gear - 2] * 30 / Math.PI;
        if ((rpm < s.redline * 0.42 && rpmDown < s.redline * 0.85) || (rpm < s.idle * 1.6)) this.shift(-1);
      }
    }
    const ratio = this.ratios[this.gear - 1];

    // ---------------- embreagem ----------------
    // segurar a embreagem (SHIFT) desacopla; soltar acopla rápido (grau de embreagem)
    const wantClutch = inp.clutch ? 0 : 1;
    const prevClutch = this.clutch;
    this.clutch = clamp(this.clutch + (wantClutch - this.clutch) * Math.min(1, dt * (wantClutch > this.clutch ? 9 : 25)), 0, 1);
    if (prevClutch < 0.35 && this.clutch >= 0.35 && this.wE > this.wRed * 0.5) {
      this.clutchPop = 0.5;
      this.popStrength = clamp((this.wE / this.wRed - 0.45) / 0.5, 0, 1);
      this.onClutchPop && this.onClutchPop(this.popStrength);
    }
    if (this.clutchPop > 0) this.clutchPop -= dt;
    // embreagem automática em baixa velocidade (não deixa o motor morrer)
    const wWheelSide = this.wR * ratio;
    let cEff = this.clutch;
    const launch = clamp((this.wE - this.wIdle * 1.1) / (this.wIdle * 1.6), 0, 1);
    if (wWheelSide < this.wIdle * 1.15) cEff = Math.min(cEff, Math.max(launch, thr > 0.05 ? 0.25 : 0.0));

    // ---------------- motor ----------------
    let Te = this.torque(this.wE) * thr;
    if (this.wE >= this.wRed) { this.rpmCut = 0.05; }
    if (this.rpmCut > 0) { this.rpmCut -= dt; Te = 0; this.limiter = true; } else this.limiter = false;
    const engineBrake = -this.Tn * 0.10 * (this.wE / this.wRed) * (1 - thr);
    let Tclutch;
    const dw = this.wE - wWheelSide;
    const locked = cEff > 0.97 && Math.abs(dw) < 15 && wWheelSide > this.wIdle;
    if (locked) {
      Tclutch = Te + engineBrake;
      this.wE = wWheelSide;
    } else {
      Tclutch = this.clutchCap * cEff * Math.tanh(dw / 25);
      this.wE += (Te + engineBrake - Tclutch - 0.02 * this.Tn) / this.Ie * dt;
      this.wE = clamp(this.wE, this.wIdle * 0.95, this.wRed * 1.01);
      if (cEff < 0.05 && thr < 0.05) this.wE = lerp(this.wE, this.wIdle, 1 - Math.exp(-dt * 1.5));
    }
    let Twheel = Tclutch * ratio * ETA;

    // ---------------- forças longitudinais ----------------
    const surf = world.surfaceAt(this.x, this.z);
    const onSand = surf.type === 'sand' || surf.type === 'water';
    const muS = this.mu * (onSand ? 0.55 : surf.type === 'grass' ? 0.7 : 1);
    const crr = this.crr + (onSand ? 0.09 : surf.type === 'grass' ? 0.03 : 0);
    const inWheelie = this.pitch > 0.005;
    const inStoppie = this.pitch < -0.005;
    const b = this.b0 + 0.11 * this.bodyLean;
    const h = this.h0 - 0.03 * Math.abs(this.bodyLean);
    const Nr = inWheelie ? this.m * G : inStoppie ? 0 : clamp(this.m * G * b / this.L + this.m * this.a * h / this.L, 0, this.m * G * 1.6);
    const Nf = this.m * G - Nr;
    const Fmax = muS * Nr;
    let Fd = Twheel / this.r;
    // tração / patinagem
    const vR = this.wR * this.r;
    if (Fd > Fmax) {
      Fd = Fmax * 0.92;
      const Ieff = this.Ie * ratio * ratio + 1.2;
      this.wR += (Twheel - Fd * this.r) / Ieff * dt;
    } else {
      this.wR = lerp(this.wR, this.v / this.r, 1 - Math.exp(-dt * 30));
    }
    if (Fd < 0 && !inWheelie) Fd = Math.max(Fd, -Fmax);
    this.spin = clamp((this.wR * this.r - this.v) / Math.max(3, this.v), 0, 3);
    const Fbf = (inWheelie ? 0 : frontBrake) * Math.min(muS * this.m * G * 1.05, this.m * G * 1.15);
    const Fbr = rearBrake * Math.min(muS * Math.max(Nr, 0) * 0.95, this.m * G * 0.7);
    const Fdrag = 0.5 * RHO * this.CdA * this.v * this.v + crr * this.m * G * (this.v > 0.05 ? 1 : 0);
    const Ftail = this.tail ? this.m * G * 0.28 : 0;
    let F = Fd - Fdrag - Ftail;
    let Fbrake = Fbf + Fbr;
    const prevV = this.v;
    this.v += (F / this.m) * dt;
    if (this.v > 0) this.v = Math.max(0, this.v - (Fbrake / this.m) * dt);
    if (this.v < 0) this.v = 0;
    this.a = (this.v - prevV) / dt;
    if (rearBrake > 0.5 && this.v < 0.5) this.wR = 0;

    // ---------------- grau / stoppie ----------------
    const m = this.m;
    // assistência: puxar o corpo para trás ajuda a levantar a frente (estilo arcade)
    const assistT = this.assist * Math.max(0, -this.bodyLean) * thr * m * G * h * 0.5 * (this.v > 1.5 ? 1 : 0) * (this.pitch < this.balanceAngle ? 1 : 0.35);
    const clutchKick = this.clutchPop > 0 && this.v > 0.5 ? m * G * h * 2.2 * this.popStrength * (this.clutchPop / 0.5) * Math.max(thr, 0.3) : 0;
    // assistência de equilíbrio: perto do ponto, uma mola leve segura o grau (desligada ao puxar forte o corpo)
    const pullHard = this.bodyLean < -0.6;
    const balAssist = this.assist && this.pitch > 0.25 && !pullHard ? -(this.pitch - this.balanceAngle) * m * G * h * 0.9 - this.pitchRate * m * h * h * 2.2 : 0;
    const th = this.pitch;
    const cw = Math.cos(th), sw = Math.sin(th);
    const tauW = m * this.a * (b * sw + h * cw) - m * G * (b * cw - h * sw) + assistT + clutchKick + balAssist;
    const bf = this.L - b;
    const ts = -th;
    const tauS = m * (-this.a) * (bf * Math.sin(ts) + h * Math.cos(ts)) - m * G * (bf * Math.cos(ts) - h * Math.sin(ts)) + (this.bodyLean > 0 ? this.bodyLean * m * G * 0.08 : 0);
    const I = this.Ip;
    let landed = 0;
    if (th > 1e-4 || (th >= -1e-4 && tauW > 0)) {
      this.pitchRate += (tauW / I - this.damp * this.pitchRate) * dt;
      this.pitch += this.pitchRate * dt;
      if (this.pitch <= 0) { landed = -this.pitchRate; this.pitch = 0; this.pitchRate = 0; }
      this.stoppie = false;
    } else if (th < -1e-4 || tauS > 0) {
      const If = m * (0.42 * 0.42 + bf * bf + h * h);
      this.pitchRate += (-tauS / If - this.damp * this.pitchRate) * dt;
      this.pitch += this.pitchRate * dt;
      if (this.pitch >= 0) { landed = this.pitchRate; this.pitch = 0; this.pitchRate = 0; }
      this.stoppie = this.pitch < -0.01;
    } else {
      this.pitchRate = 0;
    }
    if (landed > 0) this.onLand && this.onLand(landed);
    // rabeta encosta no chão
    const wasTail = this.tail;
    this.tail = false;
    if (this.pitch >= this.tailAngle) {
      if (this.pitchRate > 4.2) { this.crash('BATEU A RABETA!'); return; }
      this.pitch = this.tailAngle;
      if (this.pitchRate > 1.2) { this.pitchRate = -this.pitchRate * 0.3; this.onBump && this.onBump(4); }
      else if (this.pitchRate > 0) this.pitchRate = 0;
      this.tail = this.v > 1.0;
      if (this.v < 0.8) { this.crash('CAIU DE COSTAS!'); return; }
    }
    if (this.tail && !wasTail) this.onTail && this.onTail();
    if (this.pitch < -0.72) { this.crash('CAPOTOU POR CIMA!'); return; }
    this.wheelieTime = this.pitch > 0.1 ? this.wheelieTime + dt : 0;

    // roda dianteira: gira livre no ar, freia com o freio dianteiro
    if (this.pitch > 0.02) this.wF = Math.max(0, this.wF - (0.4 + frontBrake * 40) * dt);
    else this.wF = this.v / this.rf;

    // ---------------- direção e inclinação ----------------
    const sIn = inp.steer;
    const v = this.v;
    const wheelie = this.pitch > 0.12 || this.pitch < -0.12;
    const maxLeanGrip = Math.atan(muS * 0.95);
    const maxLean = wheelie ? 0.35 : Math.min(maxLeanGrip, 0.92);
    const leanTarget = sIn * maxLean * smooth(1.5, 9, v);
    const k = this.geo.style === 'sport' ? 7 : 5.5;
    this.lean += clamp((leanTarget - this.lean) * k * dt, -dt * 2.4, dt * 2.4);
    const yawLean = v > 0.5 ? G * Math.tan(this.lean) / Math.max(v, 2) : 0;
    const delta = sIn * 0.55 * (1 - smooth(3, 12, v)) * (wheelie ? 0.3 : 1);
    const yawKin = v * Math.tan(delta) / this.L;
    const wv = smooth(2, 7, v);
    this.yawRate = lerp(yawKin, yawLean * (wheelie ? 0.8 : 1), wv);
    this.steer = lerp(this.steer, delta + (wv * this.yawRate * this.L / Math.max(v, 1)) * 0.6, 1 - Math.exp(-dt * 12));
    this.h -= this.yawRate * dt;
    this.scrapePeg = Math.abs(this.lean) > 0.74 && v > 6 ? 1 : 0;

    // ---------------- posição, chão, colisões ----------------
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    const nx = this.x + fx * v * dt, nz = this.z + fz * v * dt;
    // colisão (centro e ponta dianteira)
    const probes = [[nx + fx * this.L * 0.85, nz + fz * this.L * 0.85], [nx + fx * this.L * 0.35, nz + fz * this.L * 0.35]];
    let hit = null;
    for (const [px, pz] of probes) { hit = world.collide(px, pz, 0.38); if (hit) break; }
    if (hit) {
      const into = -(fx * hit.nx + fz * hit.nz);
      if (v * into > 6.5) { this.crash(hit.kind === 'building' ? 'BATEU NO PRÉDIO!' : 'BATEU!'); return; }
      // desliza ao longo da parede
      this.x += hit.nx * (hit.pen || 0.05);
      this.z += hit.nz * (hit.pen || 0.05);
      this.v *= Math.max(0, 1 - into) * 0.9;
      this.onBump && this.onBump(into * v);
    } else {
      this.x = nx; this.z = nz;
    }
    const sNew = world.surfaceAt(this.x + fx * this.L, this.z + fz * this.L);
    const sHere = world.surfaceAt(this.x, this.z);
    const target = sHere.h;
    if (sNew.h - this.surfaceH > 0.06 && v > 3 && this.pitch < 0.05) {
      // subiu no meio-fio: a frente quica
      this.pitchRate += Math.min(1.6, v * 0.09);
      this.curbBump = 0.25;
      this.onBump && this.onBump(v * 0.3);
    }
    this.surfaceH = sNew.h;
    this.y = lerp(this.y, target, 1 - Math.exp(-dt * (target > this.y ? 30 : 12)));
    this.lastSurface = sHere.type;
    if (sHere.type === 'water' && sHere.h < -0.6) { this.crash('CAIU NO MAR!'); return; }
    // suspensão (visual)
    const decel = Math.max(0, -this.a);
    this.susF = lerp(this.susF, clamp(decel * 0.008 + (this.curbBump > 0 ? 0.05 : 0), 0, 0.09) * (this.pitch > 0.02 ? 0 : 1), 1 - Math.exp(-dt * 10));
    this.susR = lerp(this.susR, clamp(Math.max(0, this.a) * 0.004, 0, 0.04), 1 - Math.exp(-dt * 8));
    if (this.curbBump > 0) this.curbBump -= dt;
  }

  crash(reason) {
    if (this.crashed) return;
    this.crashed = { reason, t: 0 };
    this.onCrash && this.onCrash(reason);
  }
}
