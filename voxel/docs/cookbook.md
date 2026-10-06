# Cookbook

Techniques that make voxel pieces look like the references (isometric dioramas, cutaway rooms,
floating islands, toy characters, neon cities). Worked, runnable examples live in `voxel/lab/`
(`node voxel/tools/shot.mjs /voxel/_lab/ --query scene=<name>`): `loft` (interior, lights),
`bigisland` (750k voxels, arches, caves, cutaway water), `neon` (night city), `bunny` (character + DOF),
`island`, `catalog` (every generator), `features` (hooks, instances, pivots, lights, pick), `night`.
The published demo is `static/voxel/cottage/scene.js`.

## Scale and composition

- Pieces are small: 30–120 voxels across. A person is ~6–10 voxels tall at "diorama" scale, a door
  2×3, a window 2×2, a house 10–16 wide. Characters as the subject (bunny) use ~30–40 voxels tall.
- One strong silhouette + a ground tile/island + 2–3 secondary elements + small scatter details.
  Leave breathing room: the camera fit hugs the bounds, so tall clouds/smoke enlarge the frame.
- Isometric look: `camera: { type: 'ortho', yaw: 45, pitch: 30–35 }`. Toy/photo look: `type: 'persp',
  fov: 25–35` with DOF. Lower pitch (18–25) = heroic, higher (40–55) = map-like.
- Cutaways: build only the two back walls (at min x and min z for the default yaw 45) and leave the
  front open; for rooms add a thick floor slab so the edge reads.
- Off-model elements (a bench and lamp on the ground beside an island): separate `stage.add` calls
  with their own grids and `position`; set `fit: false` if they shouldn't enlarge the frame.

## Color and materials

- Use 2–4 shades per material family, light → dark with a hue drift (`ramp(base, 3)` gives one).
  Generators take shade arrays: `leaves: ['leafDark', 'leaf', 'leafLight']`.
- Never leave big flat areas uniform: `jitter: 0.04–0.1`, `noise: { color, scale: 0.1–0.3 }` for
  patches, `colors: [...]` for speckle (rock, cobble, foliage), `gradient` for sun-bleached tops or
  darker bases (`gradient: { color: '#334', axis: 'y', from: 20, to: 0 }`).
- Bricks, planks, tiles: `bricks()` (big stones + mortar) or `grid: 0.3–0.6` on the material for
  per-voxel seams.
- Emissive levels: 1–2 soft glow (moss, screens), 3–5 windows/lamps/neon, 6–8 fire/candles. Add
  `light: { radius: 5–10 }` to make them illuminate surroundings (and `bake: { light: true }`).
- Metals: `metalness: 0.5–1, roughness: 0.3–0.5`; glossy floors: `roughness: 0.3`.
- Water: `{ kind: 'water', color: '#4fb6c2', opacity: 0.2–0.5 }`; glass: `{ kind: 'glass', opacity: 0.1 }`.

## Recipes

### Diorama tile
```js
tile(g, [-20, -20], [20, 20], { depth: 6, top: 'grass', topDepth: 1,
  layers: [['dirt', 2], ['dirtDark', 1], ['stone', 99]], hills: 3, corner: 2 });
```
Top surface is at y = 0 (+hills), so build on y = 1. `g.top(x, z) + 1` finds the ground for scatter.

### Floating island / column
`island(g, [0, 20, 0], { radius: 16, depth: 20 })` for a round rock with craggy underside, or build a
box and carve with `g.fill`/`g.sdf` (see `lab/bigisland.js` arches). Cutaway water at a corner:
```js
g.box([0, -8, 0], [S, 2, S], 0);          // empty the corner down to the bed
g.box([0, -8, 0], [S, 1, S], 'water');     // fill (water faces render against air → a glass block)
g.box([0, -9, 0], [S, -9, S], 'sand');
```

### Trees and plants
```js
oak(g, [x, 1, z], { height: 14, seed: 3 });                   // round
oak(g, p, { style: 'clumps', leaves: ['blossomDark', 'blossom', 'blossomLight'] }); // cloud-like clumps
pine(g, p, { height: 18, snow: 'snow' });  palm(g, p, { lean: 0.5 });  willow(g, p);  bush(g, p, { radius: 3 });
foliage(g, [{ c: [0, 20, 0], r: 6 }, { c: [5, 18, 2], r: 4 }], { leaves: ['leafDark', 'leaf'] }); // any canopy
scatter(g, (x, y, z, R) => R.chance(0.2) ? flower(g, [x, y, z], { R, shape: 'dot' }) : grassTuft(g, [x, y, z], { R }),
  { on: ['grass'], density: 0.08 });
cover(g, { on: ['roofTile'], with: 'moss', amount: 0.35 });   // moss/ivy patches on roofs
vines(g, { on: ['stone'], with: ['leafDark', 'leaf'], density: 0.05 });
```
Foliage on cliff sides: only place where there's rock behind (`g.get(x - 1, y, z)`), or it floats.

### Buildings
```js
const { ridge, chimneyTop } = house(g, [x, 1, z], { w: 12, d: 9, h: 5, wall: 'plaster', roof: 'roofTile',
  door: { side: '+z' }, windows: 2, lit: 0.6, chimney: true, posts: 'beam' });
smoke(g, chimneyTop, { height: 9 });
walls(g, [0, 1, 0], [15, 8, 11], 'stoneBrick', { openings: [{ side: '+z', at: 6, w: 2, h: 3, fill: 0 }] });
g.roof([0, 9, 0], [15, 9, 11], 'roofSlate', { type: 'hip', overhang: 1 });
bricks(g, [-2, 0, -2], [30, 24, -1], { size: [4, 3], mortar: 'mortar', stones: ['wallA', 'wallB'] });
facade(g, [0, 2, 10], [20, 30, 10], { every: [3, 3], size: [2, 1], lit: ['windowLit'], chance: 0.6 });
truss(g, [0, 1, 0], [0, 30, 0], 'metal');  truss(g, [0, 30, 0], [24, 30, 0], 'metal');   // crane
stairs(g, [1, 1, 29], '-z', 14, 'plank', { width: 4, side: 'beam' });
```
Interiors: `bed, table, chair, bookshelf, fireplace, crate, barrel, lantern, lamppost (as a candle stand)`.
Exteriors: `bench, signpost (with text), campfire, bridge, boat, car, well, fence, waterfall`.

### Little people
`person(g, [x, 1, z], { side: '+z', pose: 'wave', seed: 3 })` — 2×1 footprint, ~7 tall, random skin/shirt/
pants/hair per seed (or pass ids). Populate scenes sparsely: 3–8 people make a diorama feel alive.

### Characters and small precise models
Model with boxes, then details with `ascii` on the face; or author slices with `layers`. Model half and
mirror: `g.symmetrize('x')` (odd widths centered on x = 0) / `g.symmetrize('x', -0.5)` (even widths).
```js
g.box([-6, 10, -5], [6, 20, 5], 'pink');                        // head
g.ascii([-5, 17, 6], `
  EEEE....EEEE
  EHEE....EHEE
  EEEE....EEEE`, { E: 'eye', H: 'eyeHi' });                    // eyes with highlight, on the z = 6 face
```
Eyes: dark brown/black with one lighter highlight voxel; cheeks/nose as 1–2 voxel accents.

### Night lighting
Emissive + `light` materials and `bake: { light: true }` give dozens of real-looking light pools for free.
For moving lights (a lighthouse beam, a car): `stage.light({ type: 'spot', position, target, color })`
and move it in `onUpdate`. Glow halos come from bloom; keep `bloom.threshold` ≥ 1.4 so only emissives glow.

### Animation
```js
const blade = stage.add(bladeGrid, { pivot: [0, 0, 0], position: [10, 22, 4] });  // origin at the hub
stage.onUpdate((t, dt) => { blade.rotation.z = t * 0.8; boat.position.y = Math.sin(t) * 0.3; });
```
- Wind: `sway` on materials (+ `look.wind`). Glow: `flicker`. Water ripples: automatic.
- Frame animation (a walking creature): build 2–4 grids, `stage.add` each, toggle `group.visible`.
- Shader animation: `hooks` (pulsing runes, scrolling lights) — see api.md.
- Particles: `fireflies dust sparkles snow rain embers bubbles petals leaves cubes smoke`.

### Interaction
```js
stage.renderer.domElement.addEventListener('click', (e) => {
  const hit = stage.pick(e.clientX, e.clientY);
  if (hit?.name === 'lamp') P.update('lamp', { emissive: P.def('lamp').emissive ? 0 : 5 }); // live, no remesh
});
```
Palette updates are live; geometry edits need `stage.rebuild(group)` (re-mesh; fine for occasional edits).

### Importing MagicaVoxel
```js
const { grid } = await loadVox('./model.vox', { materials: { 9: { emissive: 4, light: true } } });
stage.add(grid);             // or g.stamp(grid, x, y, z) to merge into a scene
```

## Performance

- Greedy meshing makes flat areas nearly free; noise/jitter don't affect quad count (computed in the
  shader). Speckled `colors` don't either. What costs quads is geometric detail (foliage, scatter).
- `bake.ao` costs ~0.3 s per 50k quads; `bake.light` cost scales with lit volume. Both are worth it.
- Rough budgets: ≤ 1.5M voxels, ≤ 300k quads, ≤ 2 transparent models, `ground.reflect` only when
  it matters (doubles scene render), DOF ~1 ms at 1080p.
- `await stage.progress('label', 0.5)` between heavy steps so the loader animates.
- Use `instances` for many identical props (a forest of the same 3 trees in 3 calls).
