// Click through a piece's "Explore" tour (stage.tour, lib/tour.js): screenshots after each fly-to. Dev helper, unpublished.
//   node tour.mjs /voxel/khao_sok/ [--size 900x560] [--from 5] [--only 9] [--wait 4500] [--out out/tour]
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './serve.mjs';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const path = args.find((a, i) => !a.startsWith('--') && !['--size', '--only', '--out', '--wait', '--from'].includes(args[i - 1]));
const [W, H] = opt('size', '900x560').split('x').map(Number);
const out = resolve(opt('out', 'out/tour'));
mkdirSync(out, { recursive: true });
let pw; try { pw = await import('playwright'); } catch { pw = createRequire(resolve(execSync('npm root -g').toString().trim(), 'noop.js'))('playwright'); }
const port = 9800 + Math.floor(Math.random() * 1000);
const server = await startServer(port);
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}${path}${path.includes('?') ? '&' : '?'}dpr=1`, { waitUntil: 'load' });   // dpr pinned: no adaptive resolution drop under software GL
await page.waitForFunction(() => window.VOXEL?.ready || window.VOXEL?.error, null, { timeout: 240000 });
await page.waitForTimeout(1500);
const n = await page.evaluate(() => document.querySelectorAll('.vx-tour-panel .vx-tour-item').length - 1);
const only = Number(opt('only', n));
const from = Number(opt('from', 1));
for (let i = 1; i <= Math.min(n, only); i++) {
  await page.click('.vx-tour-next');
  if (i < from) continue;                             // fast-forward: the camera flies there, no screenshot
  await page.waitForTimeout(Number(opt('wait', 4500)));
  const label = await page.textContent('.vx-tour-head');
  await page.screenshot({ path: `${out}/${String(i).padStart(2, '0')}.png` });
  console.log(i, label);
}
await browser.close(); server.close(); process.exit(0);
