// Big worlds from independent region modules — built in parallel workers, merged, clustered, meshed in
// parallel. Each region is its own file, so separate people (or parallel subagents) can own one each.
//
// A region module (e.g. static/voxel/<slug>/regions/market.js):
//
//   import { house, oak, person } from '../../lib/index.js';
//   export const box = [[0, 0, 0], [127, 63, 127]];        // optional: writes outside are dropped (with a warning)
//   export default function build(g, ctx) {                 // may be async
//     const R = ctx.rng;                                    // seeded per region (ctx.clip = true: drop overshoot silently)
//     house(g, [10, 1, 10], { seed: R.int(0, 1e6) });
//     ctx.instance('palm', [40, 1, 40], 90);                // instanced asset (from the assets module)
//     ctx.emit('particles', { preset: 'smoke', box: [[...], [...]] });
//     ctx.emit('light', { position: [20, 6, 20], color: '#ffb060' });
//     ctx.emit('actors', { creature: 'cat', count: 3, area: [[0, 0], [127, 127]] });
//   }
//
// Shared palette module (default export = material defs, same in every worker so ids match):
//   import { NATURE, BUILD } from '../../lib/index.js';
//   export default { ...NATURE, ...BUILD, adobe: { color: '#d8c7a5', jitter: 0.06 } };
//
// Assets module (optional; default export = { name: (g, ctx) => void } builders, built once per worker/main).
//
// Then in scene.js:  await stage.world({ palette: './palette.js', regions: [{ module: './regions/market.js' }, ...] })
import { VoxelGrid } from './grid.js';
import './shapes.js';
import { Palette } from './palette.js';
import { rng, noise, hashString } from './random.js';

const loaded = new Map();
async function load(url) {
  if (!loaded.has(url)) loaded.set(url, import(url));
  return loaded.get(url);
}

/** Load a palette module (default export: defs object, or a function returning one) → defs. */
export async function loadPaletteDefs(url) {
  const m = await load(url);
  const d = m.default ?? m.palette;
  return typeof d === 'function' ? d() : d;
}

/**
 * Build one region into a fresh grid. Worker-safe (no DOM). Returns
 * { name, chunks: [{ cx, cy, cz, data }], additions, firstId, extras, instances, dropped, ms }.
 */
export async function runRegion(region, paletteList) {
  const t0 = performance.now();
  const P = Palette.deserialize(paletteList);
  const firstId = P.size;
  const g = new VoxelGrid(P);
  const mod = await load(region.module);
  const build = mod.default ?? mod.build;
  if (typeof build !== 'function') throw new Error(`region ${region.module} has no default export build(g, ctx)`);
  const box = region.box ?? mod.box ?? null;
  const name = region.name ?? mod.name ?? region.module.split('/').pop().replace(/\.js$/, '');
  const seed = region.seed ?? hashString(name);
  const extras = [], instances = [];
  const ctx = {
    name, box, seed, options: region.options ?? {}, P, palette: P,
    rng: rng(seed), noise: noise(seed),
    emit: (kind, data) => extras.push({ kind, data, region: name }),
    instance: (asset, p, rot = 0, scale = 1) => instances.push([asset, p[0], p[1], p[2], rot, scale]),
    /** Is (x, y, z) inside this region's box? */
    inside: (x, y, z) => !box || (x >= box[0][0] && y >= box[0][1] && z >= box[0][2] && x <= box[1][0] && y <= box[1][1] && z <= box[1][2]),
    clip: false, // set true when you overshoot the box on purpose (rocks/trees at the edge): drop silently
  };
  await build(g, ctx);
  let dropped = 0;
  if (box) {
    const [a, b] = box;
    g.paint((x, y, z) => {
      if (x < a[0] || y < a[1] || z < a[2] || x > b[0] || y > b[1] || z > b[2]) { dropped++; return 0; }
      return undefined;
    });
  }
  const chunks = [];
  for (const c of g.chunks.values()) if (c.data.some((v) => v)) chunks.push({ cx: c.cx, cy: c.cy, cz: c.cz, data: c.data });
  return { name, chunks, additions: P.serialize(firstId), firstId, extras, instances, dropped: ctx.clip ? 0 : dropped, ms: Math.round(performance.now() - t0) };
}

/** Build assets (instanced models) → { name: { chunks, additions, firstId } }. */
export async function runAssets(url, names, paletteList) {
  const mod = await load(url);
  const defs = mod.default ?? mod.assets;
  const out = {};
  for (const name of names) {
    if (!defs[name]) throw new Error(`asset "${name}" not found in ${url}`);
    const P = Palette.deserialize(paletteList);
    const firstId = P.size;
    const g = new VoxelGrid(P);
    await defs[name](g, { name, rng: rng(hashString(name)), noise: noise(hashString(name)), P, palette: P });
    const chunks = [];
    for (const c of g.chunks.values()) if (c.data.some((v) => v)) chunks.push({ cx: c.cx, cy: c.cy, cz: c.cz, data: c.data });
    out[name] = { chunks, additions: P.serialize(firstId), firstId };
  }
  return out;
}

/** Merge a region/asset result into a grid (remapping worker-created materials). Returns voxels merged. */
export function mergeInto(grid, palette, res) {
  const map = res.additions.length ? palette.absorb(res.additions, res.firstId) : null;
  let n = 0;
  for (const c of res.chunks) {
    const d = c.data;
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (v) { n++; if (map && v >= res.firstId) d[i] = map[v]; } }
    grid.adopt(c);
  }
  return n;
}
