# Extending the library (extend first, then make the art)

When a piece needs something the lib doesn't have — a generator (a lighthouse, coral, a rope bridge),
a shading model (hatching, x-ray), a look, a particle preset, a creature — **add it to the lib first**,
register it, then build the art with it. The next piece (or the next subagent) gets it for free, and
every registered thing is automatically unit-tested, shown in the catalog and listed for discovery.

## The registry

`lib/registry.js` — everything a piece can ask for by name:

| kind | define | used as | auto-tested / shown |
|---|---|---|---|
| generator | `defineGenerator(fn, { category, summary, example, ground })` | `fn(g, p, opts)` (import it) | test.mjs runs `example` twice (determinism) + meshes + bakes; `?scene=catalog&category=…` |
| creature | `defineCreature(name, factory, { summary, habitat, example })` | `stage.actors({ creature: name })` | test.mjs checks parts/pivots/determinism; `?scene=catalog&kind=creature` |
| shading | `defineShading(name, hooks, { summary })` | `stage.add(g, { shading: name \| [a, b] })` | `?scene=catalog&kind=shading` |
| look | `defineLook(name, partialLook)` | `new Stage({ look: name })`, `?look=name` | |
| particles | `defineParticles(name, preset)` | `stage.particles({ preset: name })` | |

`list(kind)` → entries `{ name, value, ...meta }`, `lookup(kind, name)`. Listing everything:
`node -e "import('../../static/voxel/lib/index.js').then(V => ['generator','creature','shading','look','particles'].forEach(k => console.log(k, V.list(k).map(e => e.name).join(' '))))"` (from `voxel/tools`).

**Lib-wide vs piece-local.** Generic, reusable things go in the lib (`lib/gen/*.js`, `lib/registry.js`
for shadings, `lib/looks.js` for looks, `lib/particles.js` for presets) with docs. One-off things can be
registered from a piece's `scene.js` (`defineCreature('canoe', …)` in `lab/bigworld.js`) — region
modules then use them by name.

## Adding a generator

1. Pick the module: `gen/nature.js` (plants, rocks, weather), `gen/terrain.js` (ground), `gen/build.js`
   (structures, props, people), or a new `gen/<topic>.js` (then `export * from './gen/<topic>.js'` in
   `index.js` and add it to `GEN_MODULES` in `tools/test.mjs`).
2. Follow the conventions:
   - signature `name(g, p, o = {})` — `p` = base position (`[x, y, z]`, standing on y) or corner(s);
     return `g`, or useful anchor points (`house` → `{ ridge, chimneyTop }`, `campfire` → fire top).
   - deterministic: `const R = o.R ?? rng(o.seed ?? 1)` — never `Math.random()`.
   - materials by name with overridable defaults (`o.trunk ?? 'bark'`); add new default materials to
     the module's material set (`NATURE`, `BUILD`) so `{ ...NATURE, ...BUILD }` palettes just work.
   - honor `o.mode` (`'keep'` to not overwrite) by writing through `g.put(x, y, z, m, o.mode)` or shapes.
   - one-line doc comment listing opts (it's the API doc).
3. Register at the bottom of the module:
   ```js
   B_(lighthouse, 'striped lighthouse with a glowing lamp room', (g) => lighthouse(g, [0, 1, 0], { seed: 3 }));
   ```
   (`N_`/`T_`/`B_` are the per-module helpers; elsewhere `defineGenerator(fn, { category, summary, example })`.)
   The example builds on a grid with `NATURE + BUILD` materials, ground surface at y = 0, within ~±11
   voxels (one catalog cell); `ground: false` if it makes its own ground.
4. `node test.mjs` (fails if an exported generator isn't registered), then look at it:
   `node shot.mjs /voxel/_lab/ --query 'scene=catalog&only=lighthouse' --page` and with
   `--query 'scene=catalog&only=lighthouse&target=0,6,0' --zoom 4` for a close-up.
5. Add a line to `docs/api.md` (Generators) and, if it's a technique, `docs/cookbook.md`.

## Adding a shading model

A shading is a bundle of GLSL hooks injected into the voxel material (see `material.js` header and
api.md "GLSL hooks"): `uniforms`, `vertexPars`, `fragmentPars`, `vertex`, `color`, `emissive`,
`fragment`, `light`, `output`. Bundles compose in order: `shading: ['cel', 'rim']`.

```js
// lib/registry.js (built-ins live at the bottom), or in a piece
defineShading('hatch', {
  uniforms: { uHatch: { value: 0.6 } }, fragmentPars: 'uniform float uHatch;',
  output: `{ float l = dot(gl_FragColor.rgb, vec3(0.333));
    float s = step(fract((gl_FragCoord.x + gl_FragCoord.y) * 0.18), 1.0 - l) * uHatch;
    gl_FragColor.rgb *= 1.0 - s * 0.5; }`,
}, { summary: 'diagonal pencil hatching in the shadows' });
stage.add(g, { shading: 'hatch' });
```
Per-material parameters: put numbers in a material's `custom: [a, b, c, d]` and read `mc.xyzw` in the
hook (that's how `pulse` knows which voxels glow). Check with `?scene=catalog&kind=shading&only=hatch`.
Whole-frame effects (screen-space) belong in `post.js` as a new look field instead.

## Adding a look or particle preset

```js
defineLook('sunrise', { background: { type: 'linear', colors: ['#8ab0d8', '#f6c8a8'] }, sun: { elevation: 8, color: '#ffb478' }, grade: { temperature: 0.2 } });
defineParticles('ash', { count: 300, motion: 'fall', shape: 'soft', colors: ['#555', '#888'], size: 0.25, speed: 0.3, sway: 0.6, opacity: 0.8 });
```
Lib-wide ones: add to `LOOKS` in `looks.js` / `PARTICLE_PRESETS` in `particles.js` and document them in
`looks.md` / api.md (they are registered automatically). New look *fields* (a new post effect) need
`DEFAULT_LOOK` + `post.js` (+ the `?debug` panel in `ui.js`).

## Adding a creature

See animation.md "Making a creature". Four-legged animals are usually one `quadruped({...})` call; register
with `defineCreature(name, factory, { summary, habitat: 'ground' | 'water' | 'air', example })` in
`gen/creatures.js`; test.mjs checks it and `?scene=catalog&kind=creature&only=<name>` shows it walking.

## Adding something else to the stage

New per-frame systems follow the actors/particles pattern: a class with `.object` (added to
`stage.root`) and `update`/`step(dt, t)` + `pose(t)`, a `stage.<thing>(opts)` factory that keeps a list,
and a line in `frame()`. Keep them deterministic under a frozen clock (`stage.fixedTime`), so shots are
reproducible. If regions should be able to create it, handle a new `ctx.emit` kind in `stage.world()`.

## Checklist before committing a lib change

- `node test.mjs` — all green (registry coverage, determinism, mesher invariants).
- `node check.mjs` — renders every piece + lab scene; read `out/check/_sheet.png` for regressions.
- Docs: api.md entry, README file map if you added a file, cookbook/animation/big-scenes if relevant.
