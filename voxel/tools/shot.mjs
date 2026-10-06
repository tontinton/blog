// Headless screenshot harness for voxel pieces (Chromium + SwiftShader WebGL).
//
//   node shot.mjs <path> [options]
//     <path>             piece URL path under static/, e.g. /voxel/hello/   (lab scenes: /voxel/_lab/ --query scene=night)
//     --out FILE         output .png or .jpg (default out/<slug>.png). For a piece's link preview:
//                        --out ../../static/voxel/<slug>/preview.jpg --size 1200x630
//     --size WxH         viewport size (default 960x720)
//     --views N          N yaw-rotated views tiled into one image (default 1)
//     --yaw D --pitch D  camera angles in degrees (default: the piece's own view)
//     --zoom Z           zoom multiplier on the fitted view (default 1)
//     --t SECONDS        freeze the clock at this time (default 0 → piece default)
//     --query "a=1&b=2"  extra query params passed to the piece
//     --page             screenshot the whole page (UI overlays included) instead of just the canvas
//     --ui               don't pass ?shot (loader, title, ?debug panel stay; implies --page)
//     --wait MS          extra wait after ready (e.g. let particles move with --ui)
//     --timeout MS       give up after this long (default 180000)
//
// Prints console output, page errors and stage stats. Exit code 1 on page errors.
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));

async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const root = execSync('npm root -g').toString().trim();
  return createRequire(resolve(root, 'noop.js'))('playwright');
}

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1];
};
const flag = (name) => args.includes('--' + name);
const VALUED = ['--out', '--size', '--views', '--yaw', '--pitch', '--zoom', '--t', '--query', '--timeout', '--wait'];
const path = args.find((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
if (!path) {
  console.error('usage: node shot.mjs /voxel/<slug>/ [--out f.png] [--size 960x720] [--views 4] [--yaw 45] [--pitch 30] [--t 3] [--page]');
  process.exit(2);
}
const slug = path.split('/').filter(Boolean).pop() || 'shot';
const out = resolve(opt('out', resolve(here, 'out', `${slug}.png`)));
const [W, H] = opt('size', '960x720').split('x').map(Number);
const views = Number(opt('views', 1));
const timeout = Number(opt('timeout', 180000));

const port = 8737 + Math.floor(Math.random() * 1000);
const server = await startServer(port);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
let errors = 0;
page.on('console', (m) => console.log(`[${m.type()}]`, m.text()));
page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.stack || e.message); });

const q = new URLSearchParams(opt('query', ''));
if (!flag('ui')) q.set('shot', '1');
for (const k of ['yaw', 'pitch', 'zoom', 't']) if (opt(k) !== undefined) q.set(k, opt(k));
const url = `http://127.0.0.1:${port}${path}${path.includes('?') ? '&' : '?'}${q}`;
const t0 = Date.now();
try {
  await page.goto(url, { waitUntil: 'load', timeout });
  await page.waitForFunction(() => window.VOXEL?.ready || window.VOXEL?.error, null, { timeout, polling: 250 });
  const err = await page.evaluate(() => window.VOXEL.error && String(window.VOXEL.error));
  if (err) throw new Error('piece failed: ' + err);
  mkdirSync(dirname(out), { recursive: true });
  if (opt('wait')) await page.waitForTimeout(Number(opt('wait')));
  const jpeg = /\.jpe?g$/i.test(out);
  if (flag('page') || flag('ui')) {
    await page.screenshot({ path: out, ...(jpeg ? { type: 'jpeg', quality: 88 } : {}) });
  } else {
    const data = await page.evaluate(async ([n, jpg]) => window.VOXEL.stage.captureViews(n, jpg), [views, jpeg]);
    writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  }
  const stats = await page.evaluate(() => window.VOXEL.stage.stats());
  console.log('stats', JSON.stringify(stats));
  console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  errors++;
  console.error('FAILED:', e.message);
} finally {
  await browser.close();
  server.close();
}
process.exit(errors ? 1 : 0);
