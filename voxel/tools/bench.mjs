// Frame-cost benchmark for voxel pieces: renders N uncapped frames (GPU-synced) and reports ms/frame,
// split into CPU (JS: scene update + three.js submit) and GPU-wait, plus a pass breakdown.
//
//   node bench.mjs <path> [<path>...] [options]
//     <path>           piece path, e.g. /voxel/cottage/  or  /voxel/_lab/?scene=neon
//     --frames N       measured frames (default 30)
//     --size WxH       viewport (default 800x600, dpr 1)
//     --query "a=1"    extra query params (e.g. lookjson=... to A/B a look change)
//     --moving         orbit the camera every frame (worst case: no cached passes)
//     --json FILE      also write results as JSON (compare runs with --base FILE)
//     --base FILE      print the change vs an earlier --json run
//
// Headless Chromium renders with SwiftShader (CPU), so absolute numbers are much slower than a real GPU;
// they scale with the same things a GPU pays for (pixels × shader cost, vertices, passes), so use them
// for relative comparisons. In a real browser use ?bench (logs the same numbers to the console).
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { startServer } from './serve.mjs';

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const root = execSync('npm root -g').toString().trim();
  return createRequire(resolve(root, 'noop.js'))('playwright');
}

const args = process.argv.slice(2);
const VALUED = ['--frames', '--size', '--query', '--json', '--base'];
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const paths = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
if (!paths.length) { console.error('usage: node bench.mjs /voxel/<slug>/ [...] [--frames 30] [--size 800x600] [--moving]'); process.exit(2); }
const frames = Number(opt('frames', 30));
const [W, H] = opt('size', '800x600').split('x').map(Number);
const moving = args.includes('--moving');
const base = opt('base') ? JSON.parse(readFileSync(opt('base'), 'utf8')) : null;

const port = 9737 + Math.floor(Math.random() * 1000);
const server = await startServer(port);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const results = {};
let failed = 0;
for (const path of paths) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
  const q = new URLSearchParams(opt('query', ''));
  q.set('shot', '1'); q.set('dpr', '1');
  const url = `http://127.0.0.1:${port}${path}${path.includes('?') ? '&' : '?'}${q}`;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 300000 });
    await page.waitForFunction(() => window.VOXEL?.ready || window.VOXEL?.error, null, { timeout: 300000, polling: 250 });
    const err = await page.evaluate(() => window.VOXEL.error && String(window.VOXEL.error));
    if (err) throw new Error(err);
    const r = await page.evaluate(([n, moving]) => window.VOXEL.stage.bench({ frames: n, moving }), [frames, moving]);
    results[path] = r;
    const b = base?.[path];
    const d = (k) => (b?.[k] ? ` (${r[k] <= b[k] ? '' : '+'}${Math.round(((r[k] - b[k]) / b[k]) * 100)}%)` : '');
    console.log(`${path}\n  frame ${r.frame} ms${d('frame')}  cpu ${r.cpu} ms${d('cpu')}  scene ${r.scene} ms${d('scene')}  shadow ${r.shadow} ms${d('shadow')}  post ${r.post} ms${d('post')}` +
      `\n  draws ${r.draws}  tris ${r.triangles}  quads ${r.quads}  voxels ${r.voxels}` +
      `\n  frames: ${Object.entries(r.modes).filter(([, n]) => n).map(([m, n]) => `${n} ${m}`).join(', ')}  redrawn ${(r.coverage * 100).toFixed(1)}% of pixels/frame  light layers ${r.layers}`);
  } catch (e) {
    failed++;
    console.log(`${path}\n  FAILED: ${e.message}`);
  }
  await page.close();
}
await browser.close();
server.close();
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(results, null, 1));
process.exit(failed ? 1 : 0);
