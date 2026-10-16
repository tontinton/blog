// Try camera framings on a live page (as the tour flies them): one PNG per framing.
//   node frames.mjs /voxel/khao_sok/ '[{"target":[86,-2,118],"zoom":6,"yaw":0,"pitch":12}, …]' [--out out/frames] [--size 1100x700]
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer } from './serve.mjs';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const [path, json] = args;
const frames = JSON.parse(json);
const out = resolve(opt('out', 'out/frames'));
mkdirSync(out, { recursive: true });
const [W, H] = opt('size', '1100x700').split('x').map(Number);
let pw; try { pw = await import('playwright'); } catch { pw = createRequire(resolve(execSync('npm root -g').toString().trim(), 'noop.js'))('playwright'); }
const port = 9700 + Math.floor(Math.random() * 90);
const server = await startServer(port);
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}${path}${path.includes('?') ? '&' : '?'}dpr=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.VOXEL?.ready || window.VOXEL?.error, null, { timeout: 240000 });
for (const [k, f] of frames.entries()) {
  await page.evaluate((f) => window.VOXEL.stage.flyTo(f.target, { zoom: f.zoom, yaw: f.yaw, pitch: f.pitch, dur: 0.05 }), f);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/f${k}.png` });
  console.log(k, JSON.stringify(f));
}
await browser.close(); server.close(); process.exit(0);
