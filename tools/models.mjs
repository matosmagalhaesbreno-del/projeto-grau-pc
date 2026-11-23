// Regera todos os modelos 3D no Blender e comprime com gltfpack (meshopt).
// Requer Python com o módulo bpy (pip install bpy) — defina BLENDER_PY com o caminho do python,
// ou tenha o executável `blender` no PATH.
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = ['bikes.py', 'rider.py', 'props.py'];
const py = process.env.BLENDER_PY;
for (const s of scripts) {
  const file = join(root, 'tools', 'blender', s);
  console.log('> ' + s);
  if (py) execFileSync(py, [file], { stdio: 'inherit' });
  else execFileSync('blender', ['--background', '--factory-startup', '--python', file], { stdio: 'inherit' });
}
const raw = join(root, 'assets', 'models', 'raw');
const opt = join(root, 'assets', 'models', 'opt');
mkdirSync(opt, { recursive: true });
for (const f of readdirSync(raw).filter((f) => f.endsWith('.glb'))) {
  execFileSync('npx', ['gltfpack', '-i', join(raw, f), '-o', join(opt, f), '-c', '-kn', '-km', '-ke', '-noq'], { stdio: 'inherit', cwd: root });
}
console.log('Modelos prontos em assets/models/opt');
