# Animation

Four tools, from cheapest to most alive:

| want | use |
|---|---|
| leaves/grass in wind, flicker, water ripples | material fields: `sway`, `flicker`, `kind: 'water'` (+ `look.wind`) — free, in the shader |
| pulsing runes, scrolling screens, any per-voxel effect | shading hooks / `shading: 'pulse'` (see api.md, extending.md) |
| a part that spins, bobs or sways (windmill, water wheel, boat, sign) | `stage.animate(group, { spin, bob, sway })` or `stage.onUpdate` |
| creatures that walk around (cats, people, birds, ducks, fish) | `stage.actors({ creature, count, behavior })` |

Everything is driven by the stage clock: `?t=3` (and shot mode) freezes it, so screenshots are
deterministic. Actors are re-simulated from spawn to `t` in lockstep at 30 Hz when the clock is frozen.

## Moving parts: `stage.animate`

```js
const blades = stage.add(bladeGrid, { position: [24.5, 12.5, -1.5], pivot: [0.5, 0.5, 0.5], fit: false });
stage.animate(blades, { spin: [0, 0, 0.9] });                 // rad/s around x, y, z
stage.animate(stage.add(boatGrid, { position: [6, -1, 12] }), { bob: 0.25, sway: 0.04, phase: 1.3 });
stage.onUpdate((t, dt) => { door.rotation.y = Math.sin(t) * 0.5; });   // anything else, every frame
```
`pivot` puts the group origin at that grid point — rotate around a hub/hinge. `fit: false` keeps a moving
part from changing the camera framing. In big worlds a region emits an animated asset copy with
`ctx.emit('prop', { asset: 'blades', position, pivot, animate: { spin: [0, 0, 1] } })` (see big-scenes.md).

## Creatures: `stage.actors`

```js
stage.add(g);                                                  // add the terrain first — actors read it
stage.actors({ creature: 'cat', count: 3, variants: 3 });      // wanders the whole scene, avoids walls/water/cliffs
stage.actors({ creature: 'dog', options: { coat: 'golden', size: 'big' }, area: [[-10, -10], [8, 6]] });
stage.actors({ creature: 'sheep', count: 6, area: [[-29, 9], [-13, 21]] });           // inside a fenced pen
stage.actors({ creature: 'walker', count: 8, variants: 4, behavior: 'path', path: [[-20, -9], [-20, 4], [6, 4]], spread: 0.4 });
const mum = stage.actors({ creature: 'duck', on: 'water', area: [[8, 4], [20, 16]] });
stage.actors({ creature: 'duck', options: { baby: true }, count: 3, behavior: 'follow', target: mum, on: 'water' });
stage.actors({ creature: 'fish', count: 3, on: 'water' });
stage.actors({ creature: 'bird', count: 6, behavior: 'flock', center: [0, 30, 0], radius: 22 });
stage.actors({ creature: 'butterfly', count: 4, behavior: 'wander', altitude: [1.5, 4], area: [[-10, 6], [6, 20]] });
```
Worked example: `voxel/lab/cat.js` (farmyard with all of the above + windmill). All registered creatures:
`?scene=catalog&kind=creature` in the lab.

**Built-in creatures** (`lib/gen/creatures.js`): `cat` (coats `orange black white grey tuxedo calico
siamese`), `dog` (`golden brown black spotted white`, `size: small|medium|big`), `fox`, `sheep`
(grazes), `pig`, `walker` (person: `skin shirt pants hair hat height`), `bird`, `butterfly`, `duck`
(`baby`, `kind: 'white'`), `fish` (`color color2 depth`). Every one takes `seed` and `scale`.

**Behaviors**

| behavior | does | key options |
|---|---|---|
| `'wander'` (default on the ground) | picks reachable targets, walks/sprints there, idles; stays in the largest connected walkable region of `area` (streets, not rooftops) | `area`, `idle: [min,max]`, `sprint`, `speed`, `maxStep`, `region: 'any'` |
| `'path'` | walks a polyline, agents spaced evenly along it; `loop: true` (default) closes it (two points = back and forth), `loop: false` walks it once and stops | `path: [[x,z] \| [x,y,z], …]`, `loop`, `spread` (lane jitter) |
| `'follow'` | a chain: agent 0 follows `target`, each next one follows the previous | `target` (Actors, agent, Object3D, `[x,z]`, `t => [x,z]`), `spacing` |
| `'circle'` / `'flock'` (default for flyers) | circles `center` at its altitude (flock: one direction, wobbly) | `center: [x,y,z]`, `radius` |
| `'still'` | stands (idle animation only: head looks around, tail sways) | |
| `(ag, dt, t, actors) => {}` | your own: set `ag.x/y/z/heading/speed` | `actors.ground.at/ok/region` |

Fliers with `'wander'` hover `altitude: [min,max]` above the ground. `on: 'water'` makes the walkable
surface water (ducks, fish, boats); swimmers float with their rig's `lift`.

**Ground.** Actors read the voxels of every model (`ground: 'auto'`; or pass a grid/group/number) once
at creation into a height field: they step up/down at most `maxStep` (1), treat water as a wall (unless
`on: 'water'`), walk over 1-voxel tufts/flowers and under tree canopies (swaying voxels ≥ creature height
overhead), and around bushes. Create actors **after** `stage.add` (and with `keepGrid` true — `world()`
handles this itself).

**Shadows.** `shadow: 'auto'` = real shadow-map shadows (when `look.sun.update` is `'always'`), else a soft
blob under each agent (cheap, works with static shadow maps). Force with `true | 'blob' | false`.

**Variety & cost.** One actor system = one InstancedMesh per rig part → `parts` draw calls whether there
are 1 or 500 agents (+1 for blob shadows). `variants: n` builds n rigs from different seeds (varied clothes
/ coats) at n × parts draw calls; `options: [{ coat: 'black' }, { coat: 'white' }]` gives explicit variants;
`tints: ['#fff', '#fc9']` multiplies colors per instance for free. Per frame each agent costs one matrix
per part (~1 µs) — hundreds are fine.

**Reading/steering agents.** `const cats = stage.actors(...)`; `cats.agents[0]` is live
`{ x, y, z, heading, speed, state }` — attach a light (`onUpdate(() => lamp.position.set(a.x, a.y + 3, a.z))`),
make a camera follow, or drive them with a function behavior. `cats.dispose()` removes them.

## Making a creature (rigs)

A rig = a few small part grids sharing one palette, in **rig space**: feet at y = 0, facing **+z**, x
across. Each part has a `role` that drives the procedural animation and a `pivot` (joint) in rig space.

```js
import { rig, defineCreature, VoxelGrid, Palette } from '../lib/index.js';

defineCreature('frog', (o = {}) => {
  const P = new Palette({ skin: { color: o.color ?? '#5aa84a', jitter: 0.05 }, eye: '#151515', belly: '#d8e8a0' });
  const part = () => new VoxelGrid(P);
  const body = part().box([0, 1, 0], [3, 2, 3], 'skin').box([0, 1, 1], [3, 1, 2], 'belly');
  const head = part().box([0, 2, 4], [3, 3, 5], 'skin').set(0, 3, 5, 'eye').set(3, 3, 5, 'eye');
  const legs = [[-1, 0, 0, 1], [1, 3, 0, 1], [-1, 0, 3, 0], [1, 3, 3, 0]].map(([side, x, z, pair]) =>
    ({ role: 'leg', side, pair, grid: part().box([x, 0, z], [x, 0, z], 'skin'), pivot: [x + 0.5, 1, z + 0.5] }));
  return rig([{ name: 'body', role: 'body', grid: body }, { name: 'head', role: 'head', grid: head, pivot: [2, 2.5, 4] }, ...legs],
    { palette: P, scale: 0.5, speed: [1, 2], stride: 3, anim: { bob: 0.6 } });
}, { summary: 'frog', habitat: 'ground', example: (stage, { area }) => stage.actors({ creature: 'frog', count: 3, area }) });

stage.actors({ creature: 'frog', count: 5 });
```

Roles: `body` (bob), `head` (nod while walking, looks around idle; `anim.graze` dips it), `tail`
(sway; `anim.tailSpeed`, `tailLift`), `leg` (swing; `side` ±1, `pair` 0 front / 1 back → trot), `arm`
(opposite the legs), `wing` (flap about z; `anim.flap`, `flapSpeed`, `glide`), `fin` (wiggle), `static`.
For anything else give the part `animate: ({ t, agent, moving, phase }) => ({ rx, ry, rz })`.
`rig(parts, { scale, speed, stride, sprint, idle, lift, fly, swim, anim })`.

Shortcuts: most four-legged animals are one `quadruped({ width, length, legH, bodyH, headW, headH,
headD, snout, ears, tail, coat, pattern, scale, anim })` call (see `dog`/`sheep`/`pig` in creatures.js);
a vehicle or boat is a one-part rig — `rig([{ grid: g.rotated(1).recenter() }], { swim: true })` + `behavior: 'path'`
(the canoes in `lab/bigworld.js`). Register it (`defineCreature` with `habitat` + `example`) and it's
unit-tested by `tools/test.mjs` and shown in the catalog automatically.

Tips: keep creatures 2–4× chunkier than "realistic" (a cat ~10 voxels long at `scale: 0.5`); eyes are 1
dark voxel on the front face corners; contrasting belly/socks/ears read better than texture at this size.
