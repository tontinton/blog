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
// pan: big worlds need moving around, not just orbiting (right-drag / two fingers / WASD / double-tap, nav.js)
const stage = new Stage({ look: ['golden', { sun: { update: 'static' } }], camera: { maxZoom: 12, pan: true } });
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
  ctx.emit('poi', { label: 'The market', icon: '🧺', target: [x0 + 20, 4, z0 + 20], zoom: 6, yaw: 30 });   // → stage.tour(pois)
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

Emitted actors that differ only in `area` / `path` / `center` / `radius` / `spots` / `count` / `seed` (key order
doesn't matter) are **merged into one actor system** — one draw call per variant (+1 in the shadow pass)
for the whole world (each emit stays its own group: hoppers keep to their own region's spots). Live objects
can't cross the worker boundary, so families are linked by plain-data ids:
```js
ctx.emit('actors', { id: 'river-sow', creature: 'boar', area });     // prefix ids with the region name: unique world-wide
ctx.emit('actors', { creature: 'boar', options: { baby: true }, count: 4, behavior: 'follow', target: 'river-sow' });
```
Emits with an `id` or a string `target` are never merged; followers are created after their leaders. Any other difference (an extra `options: { coat }`, a different `variants`) makes a
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
  Lit particles (`leaves`, `cubes`) are moving casters too: give big or many such emits `shadow: false`
  so a static-sun world has no per-frame shadow work at all.
- **Face culling + draw order**: only the ≤ 3 face directions that can face the camera (or the sun, in the
  shadow pass) are drawn, front-to-back within each direction — half the vertices, less overdraw.
- **Water is one pass**: refracting water reuses the opaque image instead of rendering the scene twice.
- **Incremental frames**: when the camera rests, only what changed is redrawn (see api.md, "Render cache");
  a world with a few walkers and no wind redraws a few percent of its pixels per frame.
- **Adaptive resolution**: when frames take longer than their pacing allows (> 26 ms while the camera moves),
  the stage first drops 4× MSAA to 2×, then the pixel ratio in 0.25 steps (`adaptive: false` to disable);
  touch devices cap DPR at 1.5.
- **Per-frame CPU** stays flat with hundreds of agents: actors outside the view keep walking but aren't
  posed (whole systems, and single agents of shadowless systems); while partial frames don't pay off (wind
  everywhere) the render cache re-measures what changed only every 15 frames; the swaying / rippling voxels'
  screen rects are projected once per camera pose; the moving
  shadow casters restore their own patches of the shadow map; every palette's IBL table is a band of one
  atlas (one pass while the camera turns, not a render-target switch per creature palette).
- **Loading overlaps**: while the workers mesh the world (assets are built in one of them at the same time), the
  main thread sets up lights, particles and actors (actors need the voxels, not the meshes), and each worker has a
  second job queued so it never waits for a busy main thread. Clusters go out biggest first.
- **No mid-session stalls**: every program and render target the frame paths use is compiled/allocated behind
  the loader (`precompile` hands them all to the driver at once, built in parallel where the browser has
  KHR_parallel_shader_compile; `_warmup`); adaptive resolution only resizes render targets, never the canvas; a lost WebGL
  context (phones: app switches, GPU pressure) restores everything that only lived on the GPU — sky
  environment, IBL tables, shadow maps (three replaces `renderer.shadowMap`: the shadow cache re-hooks it).
  An always-moving world (wind everywhere, hundreds of actors) wants `cache: false`: partial frames never pay
  off there, and on tiled GPUs (phones, Apple silicon) a partial redraw still loads/stores the whole MSAA target.
- **Memory**: once on the GPU, voxel meshes drop their JS-side vertex/index arrays (~100 bytes a quad) —
  picking walks the grid instead (not on touch devices: `keepArrays`, so a lost context restores instantly).
  three's shadow map render target carries an unused RGBA color texture next to its depth: a 4096² map is
  128 MB — consider `look.sun.mapSize: 2048` on phones. `keepGrid: false` frees the grid instead (the meshes then keep their
  arrays for picking; `rebuild` doesn't work).
- **Bakes** run per cluster inside the workers (AO) and only over lit regions (emissive light).
- Measure with `?debug` (fps, draw calls, triangles overlay) and the `stats` line shot.mjs prints.
  SwiftShader in the container is ~50× slower than a GPU: judge fps on a real device; judge cost by
  draw calls/triangles here.

## Lower-level pieces (if world() doesn't fit)

`stage.addAsync(grid, opts)` — `add` with cluster meshing in workers; `runRegion(region, paletteList)` /
`mergeInto(grid, palette, result)` — run a region in-process; `getPool()` — the shared worker pool
(`pool.run({ type: 'region' | 'assets' | 'mesh', … })`); `clusterChunks(grid, size)`.
