// Testes da física da moto (node tests/physics.test.mjs)
import { BikePhysics } from '../src/vehicle/physics.js';
import { BIKES } from '../src/game/data.js';

const flat = { surfaceAt: () => ({ h: 0, type: 'road' }), collide: () => null };
const GEO = {
  cg160: { wheelbase: 1.311, rRear: 0.31, rFront: 0.309, style: 'commuter', tailAngle: 1.15 },
  xre300: { wheelbase: 1.417, rRear: 0.325, rFront: 0.348, style: 'trail', tailAngle: 1.0 },
  mt09: { wheelbase: 1.43, rRear: 0.315, rFront: 0.3, style: 'naked', tailAngle: 1.25 },
  s1000rr: { wheelbase: 1.457, rRear: 0.326, rFront: 0.3, style: 'sport', tailAngle: 1.3 },
};
const mk = (key, opts = {}) => { const b = new BikePhysics(BIKES.find((x) => x.key === key), GEO[key], {}, opts); b.reset(0, 0, 0); return b; };
const DT = 1 / 240;
const inp = (o = {}) => ({ throttle: 0, frontBrake: 0, rearBrake: 0, steer: 0, lean: 0, clutch: false, analog: true, ...o });
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'OK  ' : 'FALHOU'} ${name} ${info || ''}`); if (!ok) fails++; };

// 1) aceleração e velocidade máxima (sem empinar: corpo à frente)
for (const key of ['cg160', 's1000rr']) {
  const b = mk(key, { assist: 0 });
  let t100 = null, t = 0, maxPitch = 0;
  for (; t < 60; t += DT) {
    b.step(DT, inp({ throttle: 1, lean: 1 }), flat);
    maxPitch = Math.max(maxPitch, b.pitch);
    if (b.pitch > 0.3) b.pitch = 0, b.pitchRate = 0; // anula empinada para medir só o motor
    if (t100 === null && b.v * 3.6 >= 100) t100 = t;
  }
  const spec = BIKES.find((x) => x.key === key);
  const vmax = b.v * 3.6;
  check(`${key} velocidade máxima ~${spec.top} km/h`, Math.abs(vmax - spec.top) < spec.top * 0.08, `→ ${vmax.toFixed(1)} km/h, marcha ${b.gear}`);
  if (t100 !== null) console.log(`     0-100 km/h: ${t100.toFixed(2)} s`);
}

// 2) grau assistido na CG: acelera em 1ª e joga o corpo para trás
{
  const b = mk('cg160', { assist: 1 });
  for (let t = 0; t < 1.5; t += DT) b.step(DT, inp({ throttle: 1 }), flat);
  let maxP = 0;
  for (let t = 0; t < 2; t += DT) { b.step(DT, inp({ throttle: 1, lean: -1 }), flat); maxP = Math.max(maxP, b.pitch); if (b.crashed) break; }
  check('CG empina com assistência (corpo para trás)', maxP > 0.3, `pitch máx ${(maxP * 57.3).toFixed(1)}°`);
}

// 3) controlador simples segura o grau perto do equilíbrio
for (const key of ['cg160', 'mt09', 's1000rr']) {
  const b = mk(key, { assist: 1 });
  for (let t = 0; t < 1.2; t += DT) b.step(DT, inp({ throttle: 1 }), flat);
  let time = 0, crashed = false;
  for (let t = 0; t < 12; t += DT) {
    const bal = b.balanceAngle;
    const err = b.pitch - bal;
    const thr = b.pitch < 0.1 ? 1 : Math.max(0, Math.min(1, 0.5 - err * 4 - b.pitchRate * 1.2));
    const rear = err > 0.12 || (err > 0.04 && b.pitchRate > 0.2) ? 1 : 0;
    b.step(DT, inp({ throttle: thr, rearBrake: rear, lean: b.pitch < bal * 0.7 ? -1 : -0.3 }), flat);
    if (b.crashed) { crashed = b.crashed.reason; break; }
    if (b.pitch > 0.2) time += DT;
  }
  check(`${key}: grau sustentável por um piloto (12 s)`, time > 8 && !crashed, `→ ${time.toFixed(1)} s no grau${crashed ? ', caiu: ' + crashed : ''}, ${(b.v * 3.6).toFixed(0)} km/h`);
}

// 4) grau de embreagem na CG em modo simulação
{
  const b = mk('cg160', { assist: 0, autoGear: false });
  for (let t = 0; t < 1.2; t += DT) b.step(DT, inp({ throttle: 0.6, lean: 0 }), flat);
  const v0 = b.v;
  for (let t = 0; t < 0.6; t += DT) b.step(DT, inp({ throttle: 1, clutch: true, lean: -1 }), flat);
  const rpmPop = b.rpm;
  let maxP = 0;
  for (let t = 0; t < 1.5; t += DT) { b.step(DT, inp({ throttle: 1, lean: -1 }), flat); maxP = Math.max(maxP, b.pitch); }
  check('CG: grau de embreagem levanta a frente', maxP > 0.25, `→ ${(maxP * 57.3).toFixed(1)}° (rpm ao soltar ${rpmPop.toFixed(0)}, ${(v0 * 3.6).toFixed(0)} km/h)`);
  const b2 = mk('cg160', { assist: 0, autoGear: false });
  for (let t = 0; t < 2.5; t += DT) b2.step(DT, inp({ throttle: 1 }), flat);
  let maxP2 = 0;
  for (let t = 0; t < 1.5; t += DT) { b2.step(DT, inp({ throttle: 1, lean: -1 }), flat); maxP2 = Math.max(maxP2, b2.pitch); }
  check('CG sem embreagem e sem assistência quase não empina', maxP2 < 0.2, `→ ${(maxP2 * 57.3).toFixed(1)}°`);
}

// 5) stoppie com freio dianteiro forte
{
  const b = mk('s1000rr', { assist: 1 });
  b.v = 60 / 3.6; b.gear = 3;
  let minP = 0;
  for (let t = 0; t < 1.2; t += DT) { b.step(DT, inp({ frontBrake: 1, lean: 0.5 }), flat); minP = Math.min(minP, b.pitch); if (b.crashed) break; }
  check('S1000RR: stoppie no freio dianteiro', minP < -0.08 && !b.crashed, `→ ${(minP * 57.3).toFixed(1)}°${b.crashed ? ' caiu: ' + b.crashed.reason : ''}`);
}

// 6) rabeta: acelerador total com corpo para trás passa do ponto e encosta a rabeta
{
  const b = mk('mt09', { assist: 1 });
  for (let t = 0; t < 0.8; t += DT) b.step(DT, inp({ throttle: 1 }), flat);
  let tail = false;
  for (let t = 0; t < 3; t += DT) { b.step(DT, inp({ throttle: 0.8, lean: -1 }), flat); if (b.tail) tail = true; if (b.crashed) break; }
  check('MT-09: rabeta encosta no chão sem cair', tail && !b.crashed, b.crashed ? `(caiu: ${b.crashed.reason})` : '');
}

// 7) curva: inclinação e raio coerentes
{
  const b = mk('mt09');
  b.v = 15;
  for (let t = 0; t < 3; t += DT) b.step(DT, inp({ throttle: 0.25, steer: 1 }), flat);
  check('Inclina na curva (até ~45°)', b.lean > 0.5 && b.lean < 0.95, `→ ${(b.lean * 57.3).toFixed(1)}°, ${(b.v * 3.6).toFixed(0)} km/h, giro ${(b.yawRate * 57.3).toFixed(0)}°/s`);
}

console.log(fails ? `\n${fails} falha(s)` : '\nTodos os testes passaram');
process.exit(fails ? 1 : 0);
