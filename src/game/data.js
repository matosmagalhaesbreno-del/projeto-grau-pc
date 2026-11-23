// Dados das motos (especificações de fábrica aproximadas) e progressão.
export const BIKES = [
  { key: 'cg160', name: 'CG 160 Titan', brand: 'Honda', cc: 162.7, hp: 15.1, hpRpm: 8000, nm: 14.0, nmRpm: 6500, kg: 122, top: 118, redline: 9000, idle: 1400, gears: 5, cyl: 1, engine: 'single', price: 0, mu: 1.0, colorNames: ['Vermelho', 'Preto', 'Prata'] },
  { key: 'bros160', name: 'NXR 160 Bros', brand: 'Honda', cc: 162.7, hp: 14.7, hpRpm: 8000, nm: 14.2, nmRpm: 6500, kg: 128, top: 115, redline: 9000, idle: 1400, gears: 5, cyl: 1, engine: 'single', price: 22000, mu: 0.95 },
  { key: 'xre300', name: 'XRE 300', brand: 'Honda', cc: 291.6, hp: 25.6, hpRpm: 7500, nm: 27.0, nmRpm: 6000, kg: 148, top: 140, redline: 9500, idle: 1400, gears: 5, cyl: 1, engine: 'single', price: 34000, mu: 0.98 },
  { key: 'g310gs', name: 'G 310 GS', brand: 'BMW', cc: 313, hp: 34, hpRpm: 9250, nm: 28, nmRpm: 7500, kg: 175, top: 143, redline: 10500, idle: 1500, gears: 6, cyl: 1, engine: 'single', price: 42000, mu: 1.02 },
  { key: 'xj6', name: 'XJ6 N', brand: 'Yamaha', cc: 600, hp: 77.5, hpRpm: 10000, nm: 59.7, nmRpm: 8500, kg: 205, top: 215, redline: 11500, idle: 1300, gears: 6, cyl: 4, engine: 'inline4', price: 52000, mu: 1.08 },
  { key: 'mt09', name: 'MT-09', brand: 'Yamaha', cc: 890, hp: 119, hpRpm: 10000, nm: 93, nmRpm: 7000, kg: 189, top: 230, redline: 11000, idle: 1300, gears: 6, cyl: 3, engine: 'triple', price: 78000, mu: 1.12 },
  { key: 'zx10r', name: 'Ninja ZX-10R', brand: 'Kawasaki', cc: 998, hp: 203, hpRpm: 13200, nm: 114.9, nmRpm: 11400, kg: 207, top: 299, redline: 14000, idle: 1300, gears: 6, cyl: 4, engine: 'inline4', price: 125000, mu: 1.2 },
  { key: 's1000rr', name: 'S 1000 RR', brand: 'BMW', cc: 999, hp: 210, hpRpm: 13750, nm: 113, nmRpm: 11000, kg: 197, top: 303, redline: 14600, idle: 1300, gears: 6, cyl: 4, engine: 'inline4', price: 160000, mu: 1.22 },
];

export const PAINTS = ['#b0060c', '#e2e3e5', '#0a0a0c', '#1446b8', '#58b10c', '#f0c419', '#ff6b00', '#7a7d82', '#0aa6c9', '#6b2fb3', '#c4162a', '#1d6b4a'];
export const RIDER_COLORS = ['#141820', '#f1f1f1', '#c81d25', '#1b4fd1', '#f0b400', '#2e8b57', '#ff5fa2', '#6c3ce0'];

export const UPGRADES = [
  { id: 'motor', name: 'Preparação do motor', desc: '+5% de potência por nível', max: 3, cost: 0.06 },
  { id: 'escape', name: 'Escape esportivo', desc: '+4% de potência e ronco mais alto', max: 1, cost: 0.05 },
  { id: 'relacao', name: 'Relação curta (coroa maior)', desc: 'Mais força nas marchas baixas, empina mais fácil. Reduz a final.', max: 2, cost: 0.035 },
  { id: 'pneus', name: 'Pneus de alta aderência', desc: '+6% de aderência por nível', max: 2, cost: 0.03 },
  { id: 'suspensao', name: 'Suspensão regulada', desc: 'Grau mais estável e menos quique', max: 2, cost: 0.04 },
];
export const upgradeCost = (bike, up, lvl) => Math.round(Math.max(1200, bike.price || 9000) * up.cost * (lvl + 1) / 100) * 100;

// Missões em ciclo (ficam mais difíceis a cada volta)
const MISSIONS = [
  { type: 'time', goal: 3, reward: 800, text: (g) => `Segure um grau por ${g} s` },
  { type: 'clutch', goal: 1, reward: 1200, text: () => 'Faça um grau de embreagem (segure SHIFT, acelere e solte)' },
  { type: 'dist', goal: 60, reward: 1200, text: (g) => `Ande ${g} m num único grau` },
  { type: 'balance', goal: 2, reward: 1500, text: (g) => `Fique ${g} s no ponto de equilíbrio` },
  { type: 'stoppie', goal: 1, reward: 1500, text: (g) => `Faça ${g} s de stoppie (freio dianteiro forte)` },
  { type: 'cut', goal: 1, reward: 1800, text: (g) => `Dê ${g} corte em carro durante o grau` },
  { type: 'rabeta', goal: 1, reward: 2500, text: (g) => `Raspe a rabeta no chão por ${g} s` },
  { type: 'speed', goal: 60, reward: 2000, text: (g) => `Esteja a ${g} km/h no grau` },
  { type: 'points', goal: 2500, reward: 3000, text: (g) => `Faça um combo de ${g} pts` },
  { type: 'turn', goal: 90, reward: 3000, text: (g) => `Faça ${g}° de grau de giro` },
  { type: 'time', goal: 12, reward: 4000, text: (g) => `Segure um grau por ${g} s` },
  { type: 'dist', goal: 300, reward: 5000, text: (g) => `Ande ${g} m num único grau` },
];
export function missionAt(i) {
  const base = MISSIONS[i % MISSIONS.length];
  const cycle = Math.floor(i / MISSIONS.length);
  const k = 1 + cycle * 0.5;
  let goal = base.goal;
  if (base.type === 'speed') goal = Math.min(180, Math.round(base.goal + cycle * 30));
  else if (base.type !== 'clutch') goal = Math.round(base.goal * k * 10) / 10;
  return { ...base, goal, reward: Math.round(base.reward * (1 + cycle * 0.8)), text: base.text(goal), index: i };
}
