# Big scenes (cities, landscapes) — built in parallel, by parallel authors

`stage.world()` builds a scene from **region modules**: one JS file per region, each run in its own Web
Worker, merged into one grid, then meshed as frustum-culled clusters in parallel workers. Because every
region is an independent file with a fixed box, **separate subagents can each write one region** without
touching each other's code, and a region can be rendered alone for testing.

Worked examples:
- `voxel/lab/subworld.js` — a coastal town of 3 regions (orchard, market, docks) whose market and docks
  were each written by a separate subagent **in parallel**, from this doc + `subworld/layout.js` only:
  88k voxels, 36k quads, ~43 draw calls with ~30 animated creatures. The best template to copy.
- `voxel/lab/bigworld.js` — a 384×384 city of 16 regions: ~930k voxels, 400k quads, 2.2M triangles with
  instanced trees, 150 walkers, canoes and birds; generation ≈ 1 s on 3 workers.
Run `?scene=subworld` / `?scene=bigworld` in the lab; `&region=market,docks` builds only those regions.

## Layout of a big piece

```
static/voxel/<slug>/
  index.html, scene.js      the stage + stage.world({...}) call (+ custom creatures/looks registered here)
  palette.js                default export: material defs shared by every region (same ids in every worker)
  layout.js                 (recommended) shared constants: region boxes, ground level, road/canal/shore lines,
                            shared actor specs (LIFE) — the seam contract every region imports
  assets.js                 default export: { name: (g, ctx) => void } — instanced props (trees, lamps, boats…)
  regions/<name>.js         one per region: export default function build(g, ctx)
```

```js
// scene.js
import { Stage } from '../lib/index.js';
import { REGIONS } from './layout.js';
const stage = new Stage({ look: ['golden', { sun: { update: 'static' } }], camera: { maxZoom: 12 } });
await stage.world({
  palette: './palette.js', assets: './assets.js',
  regions: REGIONS.map((r) => ({ name: r.name, module: `./regions/${r.file}.js`, box: r.box, options: r.options })),
  // optional: bake ({ ao: true, light: true }), cluster (4), workers ('auto' | n | 0), keepGrid (true),
  // model: { ...stage.add opts }, assetBake ({ ao: true }), onExtra(e) for custom ctx.emit kinds, only: ['name']
});
stage.start();
```

## The region contract

```js
// regions/market.js — runs in a worker: no DOM, no stage; may import the lib and ../layout.js; may be async
import { house, oak, person, lamppost } from '../../lib/index.js';   // a lab region (voxel/lab/x/regions/) needs '../../../lib/index.js'
import { GROUND_Y, roadAt, LIFE } from '../layout.js';
export default function build(g, ctx) {
  const [[x0, , z0], [x1, , z1]] = ctx.box;           // your box (inclusive); writes outside it are dropped + warned
  const R = ctx.rng, N = ctx.noise;                   // seeded per region (stable: seed = hash of the name, or region.seed)
  g.box([x0, -4, z0], [x1, 0, z1], 'paving');         // draw your own ground over the WHOLE box (seams then match)
  house(g, [x0 + 10, 1, z0 + 10], { seed: R.int(0, 1e6) });
  ctx.instance('palm', [x0 + 30, 1, z0 + 12], 90, 1.1);                       // instanced asset (name in assets.js)
  ctx.emit('light', { position: [x0 + 20, 6, z0 + 20], color: '#ffb060' });   // stage.light
  ctx.emit('particles', { preset: 'smoke', box: [[x0 + 9, 8, z0 + 9], [x0 + 11, 22, z0 + 11]] });
  ctx.emit('actors', { ...LIFE.walker, count: 10, area: [[x0 + 2, z0 + 2], [x1 - 2, z1 - 2]] });   // shared spec → merges
  ctx.emit('actors', { creature: 'canoe', behavior: 'path', path: [[x0 + 2.5, z0], [x0 + 2.5, z1]] });   // custom creature
  ctx.emit('prop', { asset: 'windmillBlades', position: [x0 + 50, 20, z0 + 40], pivot: [0, 0, 0], animate: { spin: [0, 0, 0.8] } });
}
```

`ctx`: `name, box, seed, options` (from the region entry), `P`/`palette` (the shared palette — names
resolve; `ctx.P.add('market_awning', {...})` adds a region-local material, merged by name: **prefix
local names with the region** so two regions never collide), `rng`, `noise`, `emit(kind, data)`,
`instance(asset, [x,y,z], rotYdeg, scale)`, `inside(x, y, z)`, `clip` (set `ctx.clip = true` when you
overshoot the box on purpose — e.g. rocks or trees at the edge — and the dropped voxels aren't warned
about). Everything emitted must be plain data (it crosses a worker boundary): creatures by registered
name, no functions.

Clipping: voxels outside the box are dropped (with a console warning unless `ctx.clip`). Generators
overshoot their nominal size (rocks ~0.5, house roofs by `overhang`, trees by their canopy) — keep them
a few voxels inside. **Instanced assets and props are not clipped** — a tree instanced at the edge
overhangs the neighbour; keep it ~its radius inside.

Emitted actors that differ only in `area` / `path` / `center` / `radius` / `count` / `seed` (key order
doesn't matter) are **merged into one actor system** — one draw call per variant (+1 in the shadow pass)
for the whole world. Any other difference (an extra `options: { coat }`, a different `variants`) makes a
separate system, so put the shared specs in `layout.js` (`export const LIFE = { walker: { creature:
'walker', variants: 3 }, … }`) and have every region spread them. Actors are created before the grid is
freed, so they can read the terrain.

Ground: `tile(g, [x0, z0], [x1, z1], { depth: 6 })` fills y = −5..0 (top voxel at y = 0). Use the same
`depth`/`seed` in every region so the side walls of the slab line up.

Camera: the default view (yaw 35–45°) looks from **+x, +z** toward −x, −z — the +z and +x edges are the
front. Put tall things (towers, warehouses, sails) toward −z / −x of a region so they don't hide the rest.

Assets (`assets.js`): `export default { palm: (g, ctx) => palm(g, [0, 0, 0], { height: 13 }), … }` —
built once at the origin (base at y = 0), drawn with one instanced draw call per asset however many
regions place it. `prop` extras make separate (animatable) copies of an asset.

## Parallel subagents: the workflow

1. **Lead** (you): decide the concept, the region grid and the seams. Write `layout.js` (region boxes,
   ground level, where roads/rivers/canals/walls cross region borders, density targets), `palette.js`,
   `assets.js`, `scene.js`, and — if the art needs something the lib lacks — extend the lib first
   (extending.md) so every subagent can use it. Render the empty world (`?region=` one stub) to check
   framing/look.
2. **Spawn one subagent per region** (or per few regions) with: the concept and mood, its region name +
   file + box, the relevant parts of `layout.js` (seam contracts: "the road enters at z = 192..199 on
   your west edge"), the material names it may use, the assets it may instance, the budget, and how to
   test. It writes only `regions/<name>.js`. Prompt it to read `voxel/README.md`, `docs/big-scenes.md`,
   `docs/api.md` (generators) and `docs/animation.md` first, plus `layout.js`/`palette.js`/`assets.js`
   and one finished region as an example. Ask it to report doc gaps and missing generators — then
   extend the lib with what it had to hand-roll (the `stall` generator came from the subworld market).
3. **Each subagent tests alone**: `node shot.mjs /voxel/<slug>/ --query region=<name> --views 4` (only its
   region builds — fast) plus close-ups `--query 'region=<name>&target=x,y,z' --zoom 4`. It checks the
   console for `wrote N voxels outside its box` and the printed stats against its budget.
4. **Lead integrates**: full shots, seams (`--query region=a,b` for neighbours), the `voxel world` log
   (per-region ms) and `stats()`, then fixes seams or asks the owners to.

Budgets (per piece, for 60 fps on a laptop iGPU / recent phone): ≤ ~1.5M voxels, ≤ ~500k quads in the
merged world (+ instanced props), ≤ ~150 draw calls, ≤ ~500 actors. Divide by the number of regions
for each subagent's budget (e.g. 16 regions → ~90k voxels / 30k quads each), measured on the
`voxel world` line of a `?region=<name>` shot (the region's own voxels/quads; the `stats` line adds
instanced assets and actors). Draw calls: ≈ 2 per 128×128 cluster (solid + water) + 1 per distinct asset
+ 1 per actor variant, each ×2 when it casts shadows — creatures and assets shared across regions cost
once. Flat ground and walls are nearly free (greedy meshing); foliage, scatter and noise-carved surfaces
cost the quads.

## What keeps it at 60 fps

- **Clusters** (`cluster: 4` = 128×128-voxel columns): each is its own mesh with a bounding sphere, so
  three.js frustum-culls what's off screen; clusters mesh in parallel workers (`stage.addAsync`).
- **Instancing**: repeated assets are one draw call each (`instances` / `ctx.instance`); a creature
  variant is one rigged InstancedMesh (joint matrices in a texture) however many there are.
- **Cached shadows**: still geometry goes into the shadow map once; only moving casters are redrawn per
  frame (swaying leaves included — `look.sun.update: 'static'` freezes those; `N` updates every N frames).
- **Face culling + draw order**: only the ≤ 3 face directions that can face the camera (or the sun, in the
  shadow pass) are drawn, front-to-back within each direction — half the vertices, less overdraw.
- **Incremental frames**: when the camera rests, only what changed is redrawn (see api.md, "Render cache");
  a world with a few walkers and no wind redraws a few percent of its pixels per frame.
- **Adaptive resolution**: the stage drops the pixel ratio in 0.25 steps when frames take > 26 ms
  (`adaptive: false` to disable); touch devices cap DPR at 1.5.
- **Memory**: `keepGrid: false` frees the voxel grid after meshing (picking still works; `rebuild` doesn't).
- **Bakes** run per cluster inside the workers (AO) and only over lit regions (emissive light).
- Measure with `?debug` (fps, draw calls, triangles overlay) and the `stats` line shot.mjs prints.
  SwiftShader in the container is ~50× slower than a GPU: judge fps on a real device; judge cost by
  draw calls/triangles here.

## Lower-level pieces (if world() doesn't fit)

`stage.addAsync(grid, opts)` — `add` with cluster meshing in workers; `runRegion(region, paletteList)` /
`mergeInto(grid, palette, result)` — run a region in-process; `getPool()` — the shared worker pool
(`pool.run({ type: 'region' | 'assets' | 'mesh', … })`); `clusterChunks(grid, size)`.
