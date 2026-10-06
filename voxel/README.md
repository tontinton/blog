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
    particles.js ui.js vox.js random.js color.js gen/{nature,terrain,build}.js
    vendor/          three.js r186 (single minified module) + lil-gui
  <slug>/            one folder per piece: index.html + scene.js (+ preview.jpg)
  cottage/           the demo piece — read it first, it's ~50 lines
  pieces.json        manifest for the future /voxel gallery (new.mjs appends to it)
voxel/               (repo root, NOT published)
  README.md          you are here
  docs/api.md        full API reference
  docs/looks.md      the look system: every knob, presets, how to get each mood
  docs/cookbook.md   techniques + recipes for common subjects (rooms, islands, neon, characters…)
  docs/tools.md      screenshot harness, dev server, debugging, performance
  template/          what new.mjs copies
  lab/               unpublished test scenes (also good worked examples), served at /voxel/_lab/?scene=name
  tools/             new.mjs, shot.mjs, check.mjs (smoke test), serve.mjs, build-vendor.mjs
```

## 60-second start

```sh
cd voxel/tools
node new.mjs lighthouse "Lighthouse" "A lighthouse on a rock at dusk." golden   # scaffolds static/voxel/lighthouse/
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
   Start from a preset (`studio daylight pastel golden dreamy neon cozy clay winter`) and override fields.
   Live-tweak with `?debug`, then "copy look JSON" into the piece.
5. **Extras** — GPU particles (`stage.particles({ preset: 'snow' })`), real point lights (`stage.light`),
   custom GLSL hooks per model, instancing, voxel picking, `.vox` import, `stage.onUpdate((t, dt) => …)`.

## Workflow that works (for Claude sessions)

- Sketch the composition in code fast with generators and big boxes, shoot `--views 4`, *look at the
  image*, then refine. Iterate on small `--size 640x480` shots; they take ~5 s.
- Get form right first with `?look=clay` (`--query look=clay`), then color, then lighting/look.
- A/B look changes without editing files: `--query 'lookjson={"bloom":{"strength":1}}'`.
- Use `?t=<seconds>` (shot does `t=0`) to freeze time; particle/flicker/sway states are deterministic.
- Keep generation deterministic (`rng(seed)`, `noise(seed)`, `hash3`); never `Math.random()`.
- Budget: < ~1.5M voxels / < ~300k quads keeps mobile happy. `stage.stats()` (printed by shot.mjs) tells you.
- After finishing: write `preview.jpg`, fill in `pieces.json` (title/description/tags), commit.
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

More: [docs/api.md](docs/api.md) · [docs/looks.md](docs/looks.md) · [docs/cookbook.md](docs/cookbook.md) · [docs/tools.md](docs/tools.md)
