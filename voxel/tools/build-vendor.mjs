// Rebuilds static/voxel/lib/vendor/ from the pinned npm packages.
//   cd voxel/tools && npm i && npm run vendor
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../static/voxel/lib/vendor');
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [resolve(here, 'vendor/three-entry.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  legalComments: 'eof',
  outfile: resolve(out, 'three.module.min.js'),
});

copyFileSync(resolve(here, 'node_modules/three/examples/jsm/libs/lil-gui.module.min.js'), resolve(out, 'lil-gui.module.min.js'));
console.log('vendored three.js + lil-gui into', out);
