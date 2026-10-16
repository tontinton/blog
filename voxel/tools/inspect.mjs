// Dev helper: load a piece headless and print its actor systems / particle systems / draw-call breakdown.
//   node inspect.mjs /voxel/khao_sok/
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { startServer } from './serve.mjs';
const path = process.argv[2];
let pw; try { pw = await import('playwright'); } catch { pw = createRequire(resolve(execSync('npm root -g').toString().trim(), 'noop.js'))('playwright'); }
const port = 9900 + Math.floor(Math.random() * 90);
const server = await startServer(port);
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
await page.goto(`http://127.0.0.1:${port}${path}?shot=1&t=3`, { waitUntil: 'load' });
await page.waitForFunction(() => window.VOXEL?.ready || window.VOXEL?.error, null, { timeout: 240000 });
const info = await page.evaluate(() => {
  const s = window.VOXEL.stage;
  const acts = (s.actorSystems ?? []).map((a) => ({ c: typeof a.o?.creature === 'string' ? a.o.creature : 'custom', n: a.agents.length, v: a.rigs?.length, id: a.o?.id }));
  const parts = (s.particleSystems ?? []).map((p) => p.o?.preset ?? 'custom');
  const meshes = []; s.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh || o.isPoints) meshes.push(o.type); });
  return { acts, parts, meshes: meshes.length, models: s.models.length };
});
const by = {};
for (const a of info.acts) { const k = a.c; by[k] ??= { systems: 0, agents: 0, variants: 0 }; by[k].systems++; by[k].agents += a.n; by[k].variants += a.v ?? 1; }
console.log('actor systems', info.acts.length, 'agents', info.acts.reduce((s, a) => s + a.n, 0), 'variant-meshes', info.acts.reduce((s, a) => s + (a.v ?? 1), 0));
console.log(Object.entries(by).sort((a, b) => b[1].variants - a[1].variants).map(([k, v]) => `${k}: ${v.systems} sys / ${v.agents} ag / ${v.variants} var`).join('\n'));
console.log('particle systems', info.parts.length, info.parts.join(' '));
console.log('meshes in scene', info.meshes, 'models', info.models);
await browser.close(); server.close(); process.exit(0);
