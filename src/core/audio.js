// Áudio procedural: ronco do motor por tipo (mono, tri, 4 em linha), estalos de escape,
// corte de giro, pneu cantando, vento, raspada, mar e cidade.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function engineWave(ctx, type) {
  // espectros harmônicos (relativos à frequência de ignição) por tipo de motor
  const N = 32;
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let k = 1; k < N; k++) {
    let a;
    if (type === 'single') a = 1 / Math.pow(k, 0.9) * (k % 2 ? 1 : 0.6);
    else if (type === 'triple') a = 1 / Math.pow(k, 1.1) * (k % 3 === 0 ? 1.4 : 0.8);
    else a = 1 / Math.pow(k, 1.35) * (k % 2 ? 1 : 0.45);
    im[k] = a * (k % 4 === 1 ? 1 : -1);
  }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

function noiseBuffer(ctx, sec, brown) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.musicVol = 0.5;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    this.ctx = ctx;
    const master = ctx.createGain(); master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    this.master = master;
    this.white = noiseBuffer(ctx, 2, false);
    this.brown = noiseBuffer(ctx, 4, true);
    // motor
    const eng = ctx.createGain(); eng.gain.value = 0;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
    const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain();
    o1.connect(g1); o2.connect(g2); o3.connect(g3);
    g1.connect(shaper); g2.connect(shaper); g3.connect(shaper);
    // ruído de admissão/escape modulado
    const nz = ctx.createBufferSource(); nz.buffer = this.white; nz.loop = true;
    const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0;
    nz.connect(nbp); nbp.connect(ng); ng.connect(lp);
    shaper.connect(lp); lp.connect(eng); eng.connect(master);
    o1.start(); o2.start(); o3.start(); nz.start();
    this.e = { eng, lp, o1, o2, o3, g1, g2, g3, ng, nbp, type: null };
    // vento, pneus, raspada
    const mk = (buf, type, f, q) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(master); s.start();
      return { g, fl };
    };
    this.wind = mk(this.white, 'bandpass', 500, 0.5);
    this.skid = mk(this.white, 'bandpass', 1800, 6);
    this.scrape = mk(this.white, 'highpass', 2500, 0.7);
    this.ambient = mk(this.brown, 'lowpass', 400, 0.5);
    this.sea = mk(this.brown, 'lowpass', 900, 0.4);
    this.popTimer = 0;
  }

  resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setEngine(type, cyl) {
    if (!this.ctx) return;
    const e = this.e;
    if (e.type === type) return;
    e.type = type; e.cyl = cyl;
    const w = engineWave(this.ctx, type);
    e.o1.setPeriodicWave(w);
    e.o2.type = 'sawtooth';
    e.o3.type = 'triangle';
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, e = this.e;
    const on = s.active && this.enabled ? 1 : 0;
    const cyl = e.cyl || 1;
    const fire = Math.max(8, (s.rpm / 60) * (cyl / 2));
    const load = clamp(s.throttle, 0, 1);
    const rpmN = clamp(s.rpm / s.redline, 0, 1.05);
    // estalo do limitador: modula volume
    const limiterMod = s.limiter ? 0.45 + 0.55 * Math.random() : 1;
    const single = e.type === 'single';
    e.o1.frequency.setTargetAtTime(fire, t, 0.012);
    e.o2.frequency.setTargetAtTime(fire * (single ? 0.5 : 1.0) * 1.003, t, 0.012);
    e.o3.frequency.setTargetAtTime(fire * 2.01, t, 0.012);
    e.g1.gain.setTargetAtTime(0.55, t, 0.05);
    e.g2.gain.setTargetAtTime(single ? 0.35 : 0.12, t, 0.05);
    e.g3.gain.setTargetAtTime(0.08 + load * 0.08, t, 0.05);
    const cutoff = (single ? 500 : 900) + load * (single ? 1800 : 3800) + rpmN * (single ? 900 : 3500) + (s.escape ? 900 : 0);
    e.lp.frequency.setTargetAtTime(cutoff, t, 0.03);
    e.nbp.frequency.setTargetAtTime(fire * 3, t, 0.03);
    e.ng.gain.setTargetAtTime((0.05 + load * 0.25) * on, t, 0.05);
    const vol = on * (0.16 + load * 0.22 + rpmN * 0.12) * (s.escape ? 1.25 : 1) * limiterMod;
    e.eng.gain.setTargetAtTime(vol, t, s.limiter ? 0.005 : 0.04);
    // estalos de escape na desaceleração em giro alto
    this.popTimer -= dt;
    if (on && load < 0.05 && rpmN > 0.55 && s.prevThrottle > 0.5) this.popTimer = 0.6;
    if (on && this.popTimer > 0 && Math.random() < dt * 22) this.pop(0.5 + Math.random() * 0.5);
    // ambiente
    const v = s.speed;
    this.wind.g.gain.setTargetAtTime(on * clamp(v * v * 0.00009, 0, 0.35), t, 0.1);
    this.wind.fl.frequency.setTargetAtTime(300 + v * 18, t, 0.1);
    this.skid.g.gain.setTargetAtTime(on * clamp(s.skid, 0, 1) * 0.22, t, 0.04);
    this.scrape.g.gain.setTargetAtTime(on * (s.scrape ? 0.22 : 0), t, 0.03);
    this.ambient.g.gain.setTargetAtTime(0.10 * (s.inMenu ? 0.6 : 1), t, 0.3);
    this.sea.g.gain.setTargetAtTime(clamp(1 - s.seaDist / 160, 0, 1) * (0.12 + 0.06 * Math.sin(t * 0.4)), t, 0.3);
  }

  pop(strength = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.white;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 300 + Math.random() * 500; f.Q.value = 1.5;
    const g = c.createGain(); g.gain.setValueAtTime(0.5 * strength, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + 0.08);
  }

  thud(strength = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.35);
    const g = c.createGain(); g.gain.setValueAtTime(0.6 * strength, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.5);
    const s = c.createBufferSource(); s.buffer = this.white;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.4 * strength, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    s.connect(f); f.connect(g2); g2.connect(this.master); s.start(t); s.stop(t + 0.55);
  }

  shift() { this.pop(0.35); }

  chime(freq = 880, dur = 0.18, vol = 0.12) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  }

  horn() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    for (const f of [420, 520]) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1600;
      const g = c.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.02); g.gain.setValueAtTime(0.06, t + 0.35); g.gain.linearRampToValueAtTime(0, t + 0.4);
      o.connect(fl); fl.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.42);
    }
  }
}
