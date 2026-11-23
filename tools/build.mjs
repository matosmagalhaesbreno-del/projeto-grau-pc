// Empacota o jogo em um único script (build/grau.js) que roda direto de file://,
// no navegador ou no Electron. Modelos .glb e HDRIs entram embutidos no bundle.
import * as esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const opts = {
  entryPoints: [join(root, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome110'],
  outfile: join(root, 'build', 'grau.js'),
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  loader: { '.glb': 'binary' },
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
};
if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
} else {
  await esbuild.build(opts);
}
