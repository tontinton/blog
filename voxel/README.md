# voxel — tiny voxel dioramas for tontinton.com

A no-build ES-module library + tooling for making small, beautiful 3D voxel art pieces
(isometric dioramas, cutaway rooms, floating islands, toy characters, neon cities…) that live at
`/voxel/<slug>/` on the blog. Inspired by `/tenochtitlan/`, but shared: every piece imports the same
renderer from `/voxel/lib/`, and everything about how a piece *looks* is data you can change.

```
static/voxel/
  lib/               the library (published; pieces import it with ../lib/index.js)
    index.js         barrel — import everything from here
    grid.js shapes.js palette.js mesher.js bake.js material.js post.js stage.js looks.js
    particles.js ui.js vox.js random.js color.js
    actors.js        animated creatures (instanced rigs, behaviors, terrain following)
    registry.js      defineGenerator/Creature/Shading/Look/Particles — everything nameable
    world.js cluster.js pool.js worker.js   big scenes: parallel region modules, clusters, worker meshing
    gen/{nature,terrain,build,creatures}.js generators + creatures (all registered with examples)
    vendor/          three.js r186 (single minified module) + lil-gui
  <slug>/            one folder per piece: index.html + scene.js (+ preview.jpg)
  cottage/           the demo piece — read it first, it's ~50 lines
  pieces.json        manifest for the future /voxel gallery (new.mjs appends to it); `short` = short link name
static/v/<short>/    generated short links: tontinton.com/v/cot serves /voxel/cottage/ (tools/links.mjs)
voxel/               (repo root, NOT published)
  README.md          you are here
  docs/api.md        full API reference
  docs/looks.md      the look system: every knob, presets, how to get each mood
  docs/cookbook.md   techniques + recipes for common subjects (rooms, islands, neon, characters…)
  docs/tools.md      screenshot harness, dev server, catalog, debugging, performance
  docs/animation.md  moving parts, creatures (cats, people, birds…), behaviors, making rigs
  docs/big-scenes.md stage.world(): region modules, parallel subagents, 60 fps budgets
  docs/extending.md  extend-first workflow: add generators/shadings/looks/creatures to the lib
  template/          what new.mjs copies
  lab/               unpublished test scenes (also good worked examples), served at /voxel/_lab/?scene=name
  tools/             new.mjs, shot.mjs, test.mjs (unit tests), check.mjs (render smoke test), serve.mjs, build-vendor.mjs,
                     links.mjs (short links /v/<short>/), preview.mjs (Cloudflare preview link after a push)
```

## 60-second start

```sh
cd voxel/tools
node new.mjs lighthouse "Lighthouse" "A lighthouse on a rock at dusk." golden --short lh   # static/voxel/lighthouse/ + /v/lh/
# edit static/voxel/lighthouse/scene.js
node shot.mjs /voxel/lighthouse/ --views 4          # renders 4 rotated views into out/lighthouse.png — look at it
node shot.mjs /voxel/lighthouse/ --size 1200x630 --out ../../static/voxel/lighthouse/preview.jpg
node serve.mjs                                       # http://127.0.0.1:8737/voxel/lighthouse/?debug  (live tweak panel)
```

Playwright + Chromium are preinstalled globally in the cloud container; `shot.mjs` finds them.
Locally: `npm i playwright` in `voxel/tools` (or use the global install). No other dependencies.

A complete piece:

```js
import { Stage, VoxelGrid, Palette, NATURE, BUILD, tile, house, pine, smoke } from '../lib/index.js';

const stage = new Stage({ look: 'golden', camera: { yaw: 40, pitch: 30 }, ui: { title: 'Hut' } });
const P = new Palette({ ...NATURE, ...BUILD, lamp: { color: '#ffd28a', emissive: 5, light: { radius: 8 } } });
const g = new VoxelGrid(P);

tile(g, [-12, -12], [12, 12], { depth: 5 });                 // grass/dirt/stone slab, top at y = 0
const { chimneyTop } = house(g, [-6, 1, -5], { w: 10, d: 8, chimney: true, lit: 0.8 });
smoke(g, chimneyTop);
pine(g, [7, 1, 6], { height: 14 });
g.set(0, 1, 6, P.lamp);                                       // a single glowing voxel that lights its surroundings

stage.add(g, { bake: { ao: true, light: true } });            // mesh + bake AO and emissive light
stage.particles({ preset: 'fireflies' });
stage.start();
```

## Mental model

1. **VoxelGrid** — sparse integer grid of material ids. Draw with `g.set`, `g.box`, shape methods
   (`g.sphere`, `g.tube`, `g.roof`, `g.sdf`, `g.layers`, `g.ascii`, `g.text`…) and generator functions
   (`oak(g, p)`, `house(g, p)`, `tile(g, a, b)`…). Y is up; voxel `(x,y,z)` fills `[x,x+1]³`. Box ranges
   are **inclusive**. Grid coordinates are world coordinates (unless you pass `center`/`pivot` to `stage.add`).
2. **Palette** — named materials: colors (+ per-voxel variation), roughness/metal, glow, flicker,
   baked `light`, wind `sway`, `kind: 'water' | 'glass'`. Ids are properties (`P.grass`), names work too.
   Edits are live (it's a GPU texture) — no remesh.
3. **stage.add(grid, opts)** — greedy-meshes the grid (vertex AO, bevel data, optional ray-traced AO and
   flood-filled colored light from `light` materials) and returns a `THREE.Group` you can animate.
4. **Look** — one plain object describes the whole mood: background, sun, sky ambient, AO/bevel
   strengths, bloom, DOF/tilt-shift, fog, tone mapping, grading, vignette, grain, ground shadow/reflection.
   Start from a preset (`studio daylight pastel golden dreamy neon cozy night rainy spooky desert winter toon clay`)
   and override fields.
   Live-tweak with `?debug`, then "copy look JSON" into the piece.
5. **Extras** — GPU particles (`stage.particles({ preset: 'snow' })`), real point lights (`stage.light`),
   custom GLSL hooks / named shadings per model, instancing, voxel picking, `.vox` import, `stage.onUpdate((t, dt) => …)`.
6. **Life** — `stage.actors({ creature: 'cat', count: 3 })`: instanced creatures that walk the terrain
   (wander, paths, follow, flocks); `stage.animate(group, { spin })` for windmills and boats. animation.md.
7. **Big worlds** — `stage.world({ palette, assets, regions: [{ module, box }] })`: each region is a module
   built in its own worker (one subagent each), merged, meshed as frustum-culled clusters. big-scenes.md.
8. **Registry** — generators, creatures, shadings, looks, particle presets are registered by name with an
   example; tests and the lab catalog (`?scene=catalog`) cover them automatically. extending.md.

## Workflow that works (for Claude sessions)

- **Extend first, then art.** If the piece needs a generator/shading/creature the lib lacks, add it to the
  lib (registered, with an example — extending.md), check it in the catalog, then build the piece.
- **Big scene?** Plan regions + seams in a `layout.js`, then one subagent per region file (big-scenes.md).

- Sketch the composition in code fast with generators and big boxes, shoot `--views 4`, *look at the
  image*, then refine. Iterate on small `--size 640x480` shots; they take ~5 s.
- Get form right first with `?look=clay` (`--query look=clay`), then color, then lighting/look.
- A/B look changes without editing files: `--query 'lookjson={"bloom":{"strength":1}}'`.
- Use `?t=<seconds>` (shot does `t=0`) to freeze time; particle/flicker/sway states are deterministic.
- Keep generation deterministic (`rng(seed)`, `noise(seed)`, `hash3`); never `Math.random()`.
- Budget: < ~1.5M voxels / < ~300k quads (≤ 500k + instancing in a world) and ≤ ~150 draw calls keeps
  mobile happy. `stage.stats()` (printed by shot.mjs) tells you.
- Close-ups for details: `--query 'target=x,y,z' --zoom 4`. Lab catalog to browse what exists.
- After finishing: write `preview.jpg`, fill in `pieces.json` (title/description/tags, `short`), run
  `node links.mjs` (regenerates the `/v/<short>/` pages and the content-hash import maps that bust
  browser/CDN caches — needed after ANY edit to a piece's .js/index.html or the lib; `test.mjs` fails if stale), commit, push, then `node preview.mjs <short>` waits for
  the Cloudflare Pages build and prints the live link (`https://<branch-alias>.blog-3t8.pages.dev/v/<short>/`)
  — that link is what you give the user.
- The `/voxel/` gallery page doesn't exist yet: pieces' back link goes home. When building the gallery,
  read `static/voxel/pieces.json` and flip the default in `lib/ui.js` (marked `TODO(gallery)`).

## Gotchas

- Shapes are **grid methods** (`g.sphere(...)`); generators are **functions** taking the grid
  (`oak(g, ...)`). Generators default to `NATURE`/`BUILD` material names — spread those into your palette
  or pass your own ids (`oak(g, p, { leaves: ['myDark', 'myLight'], trunk: 'myBark' })`).
- Materials named like a Palette method (`add`, `color`, `id`, `size`…) can't be read as `P.name`; use `'name'`.
- Emissive materials only light the scene if they have `light` *and* the model is added with
  `bake: { light: true }`. For moving lights use `stage.light({...})` (real three.js lights).
- Transparent kinds (`water`, `glass`) are meshed separately and don't cast shadows; a water face is
  only drawn against air or another transparent kind, so carve the basin and fill it.
- `stage.add` meshes immediately: finish editing the grid first (or call `stage.rebuild(group)` after).
- Big flat colored areas look plastic: use `jitter`, `noise`, `colors: [...]` or `gradient` in materials.
- Look values are display colors (sRGB); the background is composited *after* tone mapping, so the
  background color you pick is exactly what you see.

- Actors read the terrain when created: call `stage.actors` after `stage.add` of the ground.
- Rendering is incremental (only what changed is redrawn; nothing changed → no GPU work). Changed one of
  your own uniforms or materials? Call `stage.invalidate()` (api.md "Render cache").

More: [docs/api.md](docs/api.md) · [docs/looks.md](docs/looks.md) · [docs/cookbook.md](docs/cookbook.md) ·
[docs/animation.md](docs/animation.md) · [docs/big-scenes.md](docs/big-scenes.md) · [docs/extending.md](docs/extending.md) ·
[docs/tools.md](docs/tools.md)
