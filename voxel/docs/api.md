# API reference

Everything is exported from `static/voxel/lib/index.js` (`import { ... } from '../lib/index.js'` in a
piece). `THREE` is re-exported too (`import { THREE } from '../lib/index.js'`) — three.js r186 plus
`OrbitControls, RoomEnvironment, FullScreenQuad, Pass, mergeGeometries, mergeVertices, SimplexNoise`.

Conventions: points are `[x, y, z]` arrays of voxel coords, **Y up**, ranges **inclusive**, angles in
**degrees**, colors are CSS-ish strings (`'#8bc34a'`, `'#8c4'`, `0x8bc34a`, `[r,g,b]` 0..1, `'rgb()'`, `'hsl()'`).
A material reference `m` is an id (`P.stone`), a name (`'stone'`), `0` (empty) or a function
`(x, y, z) => m` for procedural coloring.

---

## VoxelGrid (`grid.js`, shapes in `shapes.js`)

```js
const g = new VoxelGrid(palette)   // palette optional, but needed to use names
```

| method | notes |
|---|---|
| `get(x,y,z)` → id, `has(x,y,z)`, `set(x,y,z,m)`, `del(x,y,z)` | `set` floors coords; `set(...,0)` deletes |
| `put(x,y,z,m,mode)` | write honoring a mode (below); `m` may be a function |
| `box(a, b, m, { mode, hollow, walls })` | `hollow`: shell; `walls`: shell without top/bottom |
| `fill(a, b, (x,y,z) => m \| 0, { mode })` | procedural fill of a box |
| `forEach((x,y,z,id) => …)` | all voxels (don't add while iterating) |
| `paint((x,y,z,id) => newId \| undefined, a?, b?)` | recolor in place; `0` deletes; `undefined` keeps |
| `replace(from, to, a?, b?)` | swap one material for another |
| `surface((x,y,z,id) => …, dir = [0,1,0])` | voxels whose neighbor in `dir` is empty (tops by default) |
| `top(x, z, fromY?)` → y \| -Infinity | highest solid voxel in a column |
| `tops(x0, z0, x1, z1)` → `{ x0, z0, W, D, y: Int32Array, id: Uint16Array }` | top surface of a rectangle in one pass over its chunks (fast; empty columns = -2³¹) |
| `bounds()` → `{ min, max, size }` \| null | exact, cached |
| `count()`, `clear()`, `clone()` | |
| `stamp(src, x, y, z, { rot, flipX, flipZ, mode, remap, center })` | copy another grid; `rot` = quarter turns about Y; palettes merge by material name; `center: true` = `(x,y,z)` is where src's bottom-center lands |
| `scaled(k)`, `rotated(q)`, `mirrored('x'\|'z')` → new grid | |
| `symmetrize(axis = 'x', c = 0, keep = 'neg')` | mirror one half onto the other (model half a character); `c = -0.5` for even widths |
| `mat(m)` → id | resolve a name/id (what every writer uses) |
| `recenter(to = [0,0,0])` | moves voxels so the bottom-center sits at `to` |

**Modes** (any writer's `opts.mode`): `'replace'` (default) · `'keep'` (only into empty cells) ·
`'carve'` (delete where the shape is) · `'paint'` (only recolor existing voxels).

**Shapes** (all `g.<name>(...)`, centers are voxel centers; use `.5` offsets for even sizes):

| shape | signature |
|---|---|
| sphere | `sphere(c, r, m, { hollow })` (`hollow` = shell thickness) |
| ellipsoid | `ellipsoid(c, [rx, ry, rz], m, { hollow })` |
| cylinder | `cylinder(base, r, h, m, { axis: 'y', r2 (top radius), hollow })` |
| cone / disc | `cone(base, r, h, m)` · `disc(c, r, m, { axis })` |
| line | `line(a, b, m, { r, r2 })` (r ≤ 0.5 → 1-voxel line, else tapered capsule) |
| tube | `tube([p0, p1, …], m, { r, r2, steps })` (Catmull-Rom; branches, vines, pipes, rivers) |
| torus | `torus(c, R, r, m, { axis })` |
| pyramid | `pyramid(baseCenter, halfSize, m, { step, hollow })` (stepped) |
| roof | `roof([x0, eaveY, z0], [x1, _, z1], m, { type: 'gable'\|'hip'\|'shed'\|'flat', axis, overhang: 1, slope: 1, thickness, gable: wallId, ridge: id })` |
| sdf | `sdf((x,y,z) => dist, a, b, m \| (x,y,z,d) => id)` (inside where dist ≤ 0; sampled at voxel centers) |
| heightmap | `heightmap([x0, z0], [x1, z1], (x,z) => topY, (x,y,z,depth) => id, { base })` |
| layers | `layers(origin, [slice0, slice1, …], legend)` — text slices, bottom first; each slice is a top-down picture (cols → +x, rows → +z); `' '`/`'.'`/unknown = empty |
| ascii | `ascii(topLeft, picture, legend, { plane: 'xy'\|'zy'\|'xz', flip })` — 2D pixel art (signs, banners, faces) |
| text | `text('OPEN', topLeft, m, { plane, scale, flip })` — 3×5 pixel font |

`spline(points, steps)` (exported) returns the Catmull-Rom samples `tube` uses.

```js
g.layers([0, 1, 0], [`
  ####
  #..#
  ####`, `
  #..#
  ....
  #..#`], { '#': 'plank' });      // a 2-layer box frame
g.ascii([3, 12, 0], `
  .RR.
  RRRR
  .RR.`, { R: 'fabricRed' }, { plane: 'xy' });   // picture on the z = 0 plane, rows go down
```

---

## Palette (`palette.js`)

```js
const P = new Palette({ name: def, ... })     // or palette({...})
P.grass                 // id (property per material)       P.id('grass') → id
P.add(name, def) → id   P.update(m, props)  (live)          P.variant(base, props, name?) → id
P.color('#f80', base?) → id   (deduped material for an arbitrary color; inherits base's props)
P.def(m) → normalized def   P.has(name)   P.merge(other) → Map(otherId → id)   P.size   P.toJSON()
```

Material definition (`def` may also be just a color string):

| field | default | meaning |
|---|---|---|
| `color` | — | base color |
| `colors` | — | up to 4 colors, picked randomly per voxel |
| `jitter` | 0.04 | per-voxel brightness noise (±) |
| `hueJitter` | 0 | per-voxel hue noise, degrees |
| `noise` | — | `{ color, scale: 0.15, amount: 1, contrast: 1, offset: 0 }` smooth 3D blotches toward `color` |
| `gradient` | — | `{ color, axis: 'y', from, to, amount: 1 }` blend toward `color` along a grid axis (grid coords) |
| `roughness` / `metalness` | 0.85 / 0 | PBR (water/glass default roughness 0.06) |
| `emissive` | 0 | glow intensity (HDR, ~2–8 for lamps/neon); bloom picks it up |
| `emissiveColor` | color | glow color |
| `flicker` / `flickerSpeed` | 0 / 1 | 0..1 flicker of the glow (candles, fire) |
| `light` | — | `true` \| radius \| `{ color, intensity: 1, radius: 6, falloff: 'smooth'\|'linear'\|'quadratic' }` — baked colored light flooding through air (needs `bake: { light: true }`) |
| `sway` | 0 | wind sway (leaves 0.3–0.6, grass ~1); shadows sway too |
| `bevel` | 1 | multiplier on the look's bevel width (0 = sharp) |
| `grid` | 0 | 0..1 dark lines on every voxel edge, even across merged faces (tiles, bricks, panels) |
| `ao` | 1 | how much AO darkens this material |
| `kind` | `'solid'` | `'water'` \| `'glass'` (transparent, refractive, separate mesh) |
| `opacity` | 0.35 | water/glass: 0 = clear, 1 = solid color |
| `ior` / `wave` | 1.33 (1.5 glass) / 1 | refraction index; water ripple strength |
| `shadow` | true for solid | casts shadows |
| `custom` | `[0,0,0,0]` | free vec4 readable as `mc` in GLSL hooks |

`NATURE` and `BUILD` (from `gen/`) are ready-made material dicts used as generator defaults:
NATURE: `bark barkLight barkDark leafDark leaf leafLight pineDark pine pineLight palmDark palm palmLight
blossomDark blossom blossomLight autumnDark autumn autumnLight grassDark grass grassLight dirt dirtDark
stone stoneDark stoneLight moss sand snow water cloud cloudShade petalRed petalYellow petalWhite
petalPurple petalPink stem mushroom mushroomStem`.
BUILD: `plank plankDark plankLight beam plaster brick stoneBrick cobble roofTile roofTileDark roofSlate
thatch door glass window windowLit lamp candle fire metal metalDark gold concrete fabric fabricRed paper
neonCyan neonPink neonYellow`.

---

## Stage (`stage.js`)

```js
const stage = new Stage({
  look: 'pastel' | {...} | ['neon', {...overrides}],        // see looks.md
  camera: {
    type: 'ortho' | 'persp', fov: 28, yaw: 45, pitch: 32, zoom: 1,
    margin: 1.06, fit: 'view' | 'orbit',     // frame current yaw tightly, or every yaw
    target: [x,y,z] (default: bounds center), offset: [dx, dy] (screen fractions),
    controls: true, pan: false, damping: 0.08, minPitch: 4, maxPitch: 88, minZoom: 0.6, maxZoom: 5,
    autoRotate: 0 (deg/s), idleRotate: 0 (deg/s after 6 s idle),
  },
  ui: { title, subtitle, credit, back: '/' | url | false, backLabel, hint: true | 'text' | false, loader: true, theme: 'auto'|'light'|'dark', css },
  pixelRatio (max, default min(devicePixelRatio, 2)), adaptive: true (drop resolution when slow), msaa (4; 2 on hi-dpi), container, shotTime,
  fps: { max: 60, idle: 30, idleAfter: 3 } (frame pacing: cap on fast screens, drop to `idle` fps when the camera hasn't moved for
  `idleAfter` s — keeps laptops cool; `?fps=N` forces a rate),
  cache: true (incremental rendering, below; false = redraw everything every frame, like `?nocache`),
});
```

| member | |
|---|---|
| `add(grid, opts)` → `THREE.Group` | mesh + add. opts: `palette`, `position`, `rotation` (deg Y or `[x,y,z]`), `scale`, `center` (`false` default → grid coords = world coords; `'bottom'`/`'center'`), `pivot: [x,y,z]` (group origin at this grid point — rotate a blade around its hub), `instances: [[x,y,z,rotY,scale] \| {position,rotation,scale}]`, `bake: { ao: true \| { radius: 6, rays: 20 }, light: true, context: grid \| [grids] }` (`context`: grids in the same coordinates that occlude/emit/block light during the bakes but aren't meshed — a moving part added with `pivot` = `position` gets the room's AO + baked lamp light; sync `add` only), `ao` (vertex AO, true), `greedy` (true), `hooks` (GLSL, below), `shading` (`'cel'` \| `['cel', 'rim']` — registered hook bundles), `cluster` (4: mesh as N×N-chunk columns, frustum-culled; 0 = one mesh), `keepGrid` (true; false frees the voxels after meshing), `shadow`, `receive`, `fit` (camera fit, true), `contact` (ground contact shadow, true), `name` |
| `addAsync(grid, opts)` → Promise\<Group\> | `add` with cluster meshing + bakes in Web Workers (`workers: n \| 0`, `onProgress(f)`) |
| `world(spec)` → Promise\<`{ group, grid, palette, assets, extras, stats }`\> | big scene from parallel region modules — see [big-scenes.md](big-scenes.md) |
| `actors(opts)` → Actors | animated creatures (`{ creature, count, variants, behavior, area, path, target, on, … }`) — see [animation.md](animation.md) |
| `animate(obj, { spin: [x,y,z] rad/s, bob, sway, speed, phase })` | procedural motion for any object/group |
| `rebuild(group)` | re-mesh after editing `group.userData.model.grid` |
| `remove(group)` | |
| `addObject(obj3d, { fit })` | any three.js object |
| `light({ type: 'point'\|'spot', position, color, intensity: 20, distance: 30, decay: 1.6, shadow, target, angle, penumbra })` | real dynamic light |
| `particles(opts)` → Particles | see below |
| `onUpdate((t, dt) => …)` | per frame; `t` frozen by `?t=` |
| `models`, `actorSystems`, `particleSystems` | what's been added (`model = group.userData.model`: `{ grid, palette, opts, meshes, stats }`) |
| `progress(text, fraction)` | async: update loader, yield a frame (await between heavy steps) |
| `setLook(spec)` / `updateLook(patch)` | live look change (deep-merged) |
| `setView({ yaw, pitch, zoom, target })` | |
| `pick(clientX, clientY)` → `{ voxel, id, name, normal, point, group, model, instance }` \| null | voxel under the pointer |
| `start()` → Promise | first frame + loop; sets `window.VOXEL.ready` |
| `captureViews(n, jpeg)` → dataURL | n yaw-rotated views tiled |
| `stats()` | voxels, quads, mesh/bake ms, draw calls, bounds, `cache` (last frame's mode, redrawn fraction) |
| `invalidate()` | redraw everything next frame — after changing something the render cache can't see (below) |
| `bench({ frames, moving })` | GPU-synced frame-cost medians: `{ frame, cpu, scene, shadow, post, modes, coverage }` (`?bench` logs them) |
| `scene camera renderer controls sun fill ambient ground post` | the raw three.js objects — use freely |
| `uniforms` | shared voxel uniforms: `uTime, uWind, uAO, uBevel, uLook, uWater, uSeed` (see material.js) |
| `look`, `bounds` (Box3), `radius`, `time`, `fixedTime` (frozen clock or null) | |

Camera orientation: at the default yaw (45°; most pieces use 35–40°) the camera looks from **+x, +z**
toward the origin — the +z/+x sides of a scene are the front; tall things belong at −z/−x.

URL params every piece understands: `?debug` (tweak panel + stats overlay), `?look=name`,
`?lookjson={…}`, `?t=seconds`, `?yaw= &pitch= &zoom=`, `?target=x,y,z` (close-ups), `?dpr=`, `?region=a,b`
(world: build only those), `?shot` (used by shot.mjs), `?nocache` (no incremental rendering), `?bench` (log frame
costs after load, at rest and orbiting).

**Render cache** (`cache.js`). Every frame the stage works out what changed and draws only that:
nothing → no GPU work at all (and the loop stops entirely when nothing *can* change: no actors, particles,
`onUpdate`, wind, flicker, water or stars; input/resize/look changes wake it); only particles / a light's
brightness → particle layer + post; small things moved (actors, animated models, flickering/swaying/
rippling voxels, their sun shadows) → the scene is redrawn inside screen rectangles around them; the
camera moved or too much changed → a full frame. A light whose intensity/color animates (a flickering
fire, a day cycle) becomes a *light layer*: drawn once alone at intensity 1 and added back by the composite,
so it costs nothing per frame; a shadowless point/spot light that also jiggles within ~1.5 voxels gets 3
gradient layers (first-order position change). What it detects on its own: camera, size, look,
`stage.uniforms`, environment, models/objects added/removed/moved/hidden, palette edits, lights, actors,
particles. What it can't: your own hook uniforms (models with hook uniforms or `uTime` are redrawn every
frame anyway) and materials/uniforms of objects you added yourself — call `stage.invalidate()` after those.
Big always-moving areas (wind through a forest, its shadows) fall back to full frames: that's real change.

Animating lighting every frame: change `stage.sun.intensity/color/position`, `stage.scene.environmentIntensity`,
`stage.uniforms.uLook.value.x` (emissive multiplier) directly — `updateLook` rebuilds the environment and
shadow map when sky/sun change, too heavy per frame. Animating objects: transform the group returned by `add`.
Cheapest: animate a light's `intensity`/`color` (a light layer, free per frame) and keep its position still or
within a voxel or so; moving the sun or `environmentIntensity` redraws everything.

**GLSL hooks** (`stage.add(g, { hooks })`, see `material.js` header): `uniforms`, `vertexPars`,
`fragmentPars`, `vertex` (edit `transformed`, object space), `color` (edit `col` per voxel), `emissive`
(add to `emis`), `fragment` (edit `diffuseColor`), `light` (after lighting + AO: edit
`reflectedLight.directDiffuse/indirectDiffuse/directSpecular/indirectSpecular`; `normal`,
`geometryViewDir` available — cel shading, rim light), `output` (final linear HDR `gl_FragColor`).
In scope: `cell` (vec3 voxel coords), `nObj`, `vObj`, `mid` (material id), `m0..m3`, `mc` (material
`custom`), `h` (per-voxel hash 0..1), `uTime`. Example: `voxel/lab/cel.js` (cel shading + rim).

```js
stage.add(g, { hooks: {
  uniforms: { uPulse: { value: 0 } }, fragmentPars: 'uniform float uPulse;',
  emissive: 'emis += vec3(0.2, 0.9, 1.0) * mc.x * (0.5 + 0.5 * sin(uTime * 3.0 + cell.y * 0.4));',
}});
P.add('rune', { color: '#335', custom: [2, 0, 0, 0] });   // mc.x = 2 for rune voxels only
```

---

## Actors (`actors.js`, creatures in `gen/creatures.js`)

Full guide: [animation.md](animation.md). One draw call per creature variant (rigged instancing:
`createVoxelMaterial({ rig: true })` reads per-part matrices from `uRig`). `stage.actors(opts)` → `Actors` with `.agents` (live
`{ x, y, z, heading, speed, state }`), `.object`, `.ground` (`at(x,z)`, `ok(x,z)`, `region(x,z)`), `.dispose()`.
Options: `creature` (name \| rig \| factory), `options` (creature opts or array = variants), `variants`, `count`,
`behavior` (`'wander' 'path' 'follow' 'circle' 'flock' 'still'` \| `(ag, dt, t, actors) => {}`), `area`,
`groups: [{ area \| path \| center + radius, count }]`, `path`, `loop`, `spread`, `center`, `radius`, `altitude`, `target`,
`spacing`, `ground` (`'auto'` \| grid \| group \| y), `on` (`'ground'` \| `'water'`), `maxStep`, `region`,
`speed`, `scale`, `tints`, `idle`, `sprint`, `shadow` (`'auto'` \| true \| `'blob'` \| false), `seed`.

Creatures: `cat dog fox sheep pig walker bird butterfly duck fish` (+ `quadruped(opts)` builder).
`rig(parts, { scale, speed, stride, sprint, idle, lift, fly, swim, anim })` makes your own; parts are
`{ name, role: 'body'|'head'|'tail'|'leg'|'arm'|'wing'|'fin'|'static', side, pair, grid, pivot, animate }`.
`heightField(sources, area, on, clear, maxStep)` is the terrain sampler actors use.

---

## Registry (`registry.js`)

Full guide: [extending.md](extending.md). `defineGenerator(fn, { category, summary, example, ground })`,
`defineCreature(name, factory, { summary, habitat, example })`, `defineShading(name, hooks, meta)`,
`defineLook(name, look)`, `defineParticles(name, preset)`; `list(kind)`, `lookup(kind, name)`,
`register(kind, name, value, meta)`, `combineHooks(hooks, shading)`.
Built-in shadings: `cel` (3-band toon), `rim` (`uRim`), `posterize` (`uPosterize`), `pulse` (glow on
materials with `custom: [strength, speed]`), `height-tint` (`uTintLow`, `uTintRange`), `hatch` (`uHatch`).
The lab catalog renders any kind: `?scene=catalog[&kind=creature|shading][&category=build][&only=a,b]`.

---

## Particles (`particles.js`)

`stage.particles({ preset, ...overrides })`. Presets: `fireflies dust sparkles snow rain embers bubbles
petals leaves cubes smoke`. `mist` (waterfall spray) too.
Options: `count`, `box: [[x0,y0,z0],[x1,y1,z1]]` (world = grid coords; default
scene bounds), `motion: 'drift'|'fall'|'rise'|'float'|'plume'`, `speed`, `turbulence`, `sway`,
`shape: 'soft'|'square'|'cube'`, `lit` (cubes: sun-lit), `color`/`colors`, `size` (world units),
`sizeJitter`, `glow` (HDR → bloom), `opacity`, `blink`, `blinkSpeed`, `spin`, `flat` (cube y-scale),
`stretch` (rain streaks), `fade`, `seed`. Returns an object with `.object` (three.js) and `.set(opts)`.
Chimney smoke: `{ preset: 'smoke', box: [[x-1, y, z-1], [x+1, y+14, z+1]] }`.

---

## Generators (`gen/*.js`) — functions `(g, position, opts)`

All accept `seed` (or `R`, an rng) and material overrides. Foliage uses `mode: 'keep'` by default.

**nature.js** — `oak(g, p, { height, radius, trunk, leaves: [dark..light], branches, lean, style: 'blob'|'clumps', squash, holes, roughness })`
· `blossom` (pink clumpy oak) · `bush(g, p, { radius, leaves, lumps })` · `pine(g, p, { height, radius, tiers, leaves, snow })`
· `palm(g, p, { height, lean, fronds, length, width, trunk, ring, leaves, coconut })` · `willow(g, p, {…oak, strands, strandLength})`
· `branches(g, p, { height, depth, spread, trunk, tips })` (bare/dead tree) · `rock(g, p, { size: [x,y,z] | radius, stone: shades, moss, bury, facet })`
· `foliage(g, [{ c, r }, …], { leaves, roughness, freq, squash, holes, bias, clipBelow, speckle })` (noisy blob union; `speckle` 0.2 = per-voxel shade randomness, lower for calmer canopies — custom canopies, hedges)
· `grassTuft`, `flower(g, p, { height, petal, center, stem, shape: 'plus'|'dot'|'cup' })`, `mushroom`, `reeds`
· `cloud(g, p, { length, height, depth, puffs, shades })` · `smoke(g, p, { height, drift: [dx,dz], puffs, spread })`
· `scatter(g, (x,y,z,R,belowId) => …, { on: [ids], density, area: [[x0,z0],[x1,z1]], seed })` — run on air cells above matching voxels
· `cover(g, { on, with, amount, scale, depth })` — noisy moss/snow/ivy on top faces
· `vines(g, { on, with, density, length })` — strands hanging down walls

**terrain.js** — `tile(g, [x0,z0], [x1,z1], { y: 0, depth: 6, top, topDepth, layers: [[id, thickness], …], hills, corner, edge, lip })` (fills y − depth + 1 … y)
· `terrain(g, a, b, { base, height, scale, octaves, ridged, top, layers, steep, sand, water, waterLevel, snow, snowLine })`
· `island(g, center, { radius, depth, relief, shape: 'round'|'square', top, layers, under })` (floating island)
· `pond(g, [x, z], { radius, depth, water, shore, bed, level })` · `river(g, [[x,z], …], { width, depth })`
· `trail(g, [[x,z], …], { width, with })` · `strata(g, { on, bands: [[id, h], …], wobble })` (rock bands on cliffs)

**build.js** — sides are `'+x' | '-x' | '+z' | '-z'` (outward). `walls(g, lo, hi, m, { floor, ceiling, posts, beam, base, openings })`
· `opening(g, lo, hi, { side, at, w, h, y, fill, frame, sill })` · `house(g, minCorner, { w, d, h, wall, roof, roofType, overhang, door, windows, window, lit, chimney, … })` → `{ ridge, chimneyTop }`
· `fence(g, [[x,y,z], …], { post, rail, height, every })` · `stairs(g, p, dir, steps, m, { width, side })` · `ladder`
· `lamppost(g, p, { height, pole, lamp, arm })` · `well` · `truss(g, a, b, m, { size: 4 })` (lattice girder)
· `facade(g, a, b, { every: [3,3], size: [1,1], lit: [ids], window, chance })` (window grids)
· `bricks(g, a, b, { size: [3,2], stones, mortar, axis, stagger })` (big stones + mortar; `axis: 'y'` = floor planks/paving)
· props: `crate`, `barrel`, `table`, `chair`, `bed`, `bookshelf`, `fireplace(g, p, side, { w, h, stone, fire })`,
  `bench(g, p, side, { length })`, `signpost(g, p, { text })`, `lantern(g, ceilingPoint, { drop })`, `campfire(g, p)` → fire top
· `person(g, p, { side, pose: 'stand'|'wave'|'sit', height: 7|8, skin, shirt, pants, hair, hat, seed })` — tiny ~7-voxel people (random colors per seed);
  2 wide across its facing, `p` = the lower across-axis cell; `pose: 'sit'` at a `bench`'s `p` sits on it.
  `house` windows `[{ side, at, y }]`: `at` = offset along the wall from its start corner, `y` = above the floor
· `bridge(g, a, b, { width, arch, deck, rail, post })` · `boat(g, keelStern, { length, width, height, hull, hullTop, deck, cabin, mast, mastAt })` (clears its interior — drop it into water; keel y, deck y + height − 2, rim y + height − 1: height ≥ 3, width ≥ 5 for a deck)
· `stall(g, frontCentre, side, { w, d, awning: [a, b], goods: 'fruit'|'veg'|'fish'|'bread'|'flowers'|'cloth'|'pots'|[colors]|fn, crates, vendor })` → `{ front }` (market stall)
· `car(g, p, { color, axis, glass, wheel, light })`
· (all registered with examples — `?scene=catalog` in the lab shows each one)
· nature.js also has `waterfall(g, top, bottomY, { width, depth, water, foam })` (pair with `stage.particles({ preset: 'mist', box })`)

---

## Utilities

- `rng(seed)` → `R()` [0,1), `R.range(a,b)`, `R.int(a,b)` (inclusive), `R.pick(arr)`, `R.chance(p)`, `R.sign()`,
  `R.gauss()`, `R.weighted([[x, w], …])`, `R.shuffle(arr)`, `R.disc()`, `R.dir()`, `R.fork(salt)`
- `hash3(x,y,z,seed)`, `hash2`, `hash1`, `hashString` — stable per-cell randomness
- `noise(seed)` → `{ simplex2, simplex3, value2, value3, fbm2, fbm3, ridged2, worley2, worley3, warp2 }`
  (`fbm*(…, { octaves, lacunarity, gain })`; simplex/fbm ∈ [-1,1], value/ridged ∈ [0,1], worley → `{ f1, f2, id }`)
- `clamp, mix, smoothstep, remap`
- color: `rgb, hex, toInt, srgbToLinear, linearToSrgb, hsl, fromHsl, oklab, fromOklab, mixColor, shade(c, ±L),
  shift(c, { h, s, l }), gradient([c0, c1, …])(t), ramp(base, n), luminance`
- `loadVox(url, { materials: { [paletteIndex]: def }, palette, prefix, base, recenter })` → `{ grid, palette, ids }`;
  `parseVox(arrayBuffer, opts)`. Materials are named `vox<index>-<hex>`; translations are applied, rotations
  ignored; files without an RGBA chunk get a grey ramp.
- Shared bakes: `sharedBaker([grid, ...partGrids], palette, { ao, light })` → pass `bake: { baker }` to every `stage.add` of
  those grids: one AO volume + light field for a room and all its moving parts (far cheaper than `bake.context` per part).
- Low level: `buildMesh(grid, palette, opts)`, `createVoxelMaterial`, `createVoxelDepthMaterial`,
  `createVoxelUniforms`, `Post`, `resolveLook`, `merge`, `LOOKS`, `DEFAULT_LOOK`, `PARTICLE_PRESETS`,
  `clusterChunks`, `clusterInputs`, `geometryFromArrays`, `WorkerPool`/`getPool`, `runRegion`, `runAssets`,
  `mergeInto`, `loadPaletteDefs`, `Palette#serialize/deserialize/absorb` (worker transfer).
