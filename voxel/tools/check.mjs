// Smoke test: render every published piece and every lab scene small, report errors + timings,
// and write a contact sheet. Run after changing the lib.
//   node check.mjs [--only name,name] [--size 480x360]
import { readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const only = opt('only', '')?.split(',').filter(Boolean);
const size = opt('size', '480x360');
const pieces = readdirSync(resolve(here, '../../static/voxel')).filter((d) => d !== 'lib' && existsSync(resolve(here, '../../static/voxel', d, 'index.html')));
const labs = readdirSync(resolve(here, '../lab')).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''));
const jobs = [...pieces.map((p) => ({ name: p, path: `/voxel/${p}/`, query: '' })), ...labs.map((l) => ({ name: `lab-${l}`, path: '/voxel/_lab/', query: `scene=${l}` }))]
  .filter((j) => !only?.length || only.includes(j.name));
let failed = 0;
const outs = [];
for (const j of jobs) {
  const out = resolve(here, 'out/check', `${j.name}.png`);
  const t0 = Date.now();
  const r = spawnSync('node', [resolve(here, 'shot.mjs'), j.path, '--size', size, '--out', out, ...(j.query ? ['--query', j.query] : []), '--timeout', '240000'], { encoding: 'utf8' });
  const ok = r.status === 0 && existsSync(out) && statSync(out).mtimeMs >= t0 - 1000;
  const stats = (r.stdout.match(/^stats (.*)$/m) || [])[1];
  const s = stats ? JSON.parse(stats) : {};
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${j.name.padEnd(18)} ${((Date.now() - t0) / 1000).toFixed(1)}s  voxels ${s.voxels ?? '-'}  quads ${s.quads ?? '-'}  mesh ${s.meshMs ?? '-'}ms`);
  if (!ok) { failed++; console.log((r.stdout + r.stderr).split('\n').filter((l) => /error|FAILED/i.test(l)).slice(0, 6).join('\n')); }
  else outs.push(out);
}
// contact sheet via python/PIL if available
const py = `
import sys
from PIL import Image
fs = sys.argv[1:]
ims = [Image.open(f) for f in fs]
w, h = ims[0].size
cols = 4
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows), (30, 30, 30))
for i, im in enumerate(ims): sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.save('${resolve(here, 'out/check/_sheet.png')}')
`;
if (outs.length) {
  const r = spawnSync('python3', ['-c', py, ...outs], { encoding: 'utf8' });
  console.log(r.status === 0 ? `contact sheet: out/check/_sheet.png` : 'contact sheet skipped (no PIL)');
}
process.exit(failed ? 1 : 0);
