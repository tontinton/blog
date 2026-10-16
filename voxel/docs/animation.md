# Animation

Four tools, from cheapest to most alive:

| want | use |
|---|---|
| leaves/grass in wind, flicker, water ripples | material fields: `sway`, `flicker`, `kind: 'water'` (+ `look.wind`) — free, in the shader |
| pulsing runes, scrolling screens, any per-voxel effect | shading hooks / `shading: 'pulse'` (see api.md, extending.md) |
| a part that spins, bobs or sways (windmill, water wheel, boat, sign) | `stage.animate(group, { spin, bob, sway })` or `stage.onUpdate` |
| creatures that walk around (cats, people, birds, ducks, fish) | `stage.actors({ creature, count, behavior })` |

Everything is driven by the stage clock: `?t=3` (and shot mode) freezes it, so screenshots are
deterministic. Actors are re-simulated from spawn to `t` in lockstep at 30 Hz when the clock is frozen. (The replay is capped at 1800 steps: `?t=` above 60 s shows t = 60.)

## Moving parts: `stage.animate`

```js
const blades = stage.add(bladeGrid, { position: [24.5, 12.5, -1.5], pivot: [0.5, 0.5, 0.5], fit: false });
stage.animate(blades, { spin: [0, 0, 0.9] });                 // rad/s around x, y, z
stage.animate(stage.add(boatGrid, { position: [6, -1, 12] }), { bob: 0.25, sway: 0.04, phase: 1.3 });
stage.onUpdate((t, dt) => { door.rotation.y = Math.sin(t) * 0.5; });   // anything else, every frame
```
`pivot` puts the group origin at that grid point — rotate around a hub/hinge.
**Moving parts that match the room's lighting.** Model the part in place (scene coordinates, rest pose) in
its own grid, add it with `{ pivot: joint, position: joint, fit: false, bake: { ao: true, light: true, context: roomGrid } }`
and the room as bake context: the part gets the same ray AO and baked lamp/fire light as if it were part of the room
(and `context: [parts…]` on the room's own `add` lets the parts shade the room). Then rotate it in `onUpdate`.
With many parts, build one `sharedBaker([room, ...parts], P)` and pass `bake: { baker }` to every add instead
(computed once — see api.md). Used for character heads/tails/arms in `static/voxel/family_autumn/`. `fit: false` keeps a moving
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
**Canopy & sky** (`lib/gen/canopy.js`): `gibbon` (brachiates on 3D paths; `coat: black|buff`, `pose: hang|sit`),
`langur` (sits on spots, tail dangling; `pose: walk`), `hornbill` (perches/hops, slow flaps + glides),
`kingfisher` (hops between perches), `bat` (`kind: cave|fox`; streams on paths, hangs on spots), `birdwing`
(`kind: golden|rajah`), `dragonfly` (`color: blue|red`; darts over water).

**Behaviors**

| behavior | does | key options |
|---|---|---|
| `'wander'` (default on the ground) | picks reachable targets, walks/sprints there, idles; stays in the largest connected walkable region of `area` (streets, not rooftops) | `area`, `idle: [min,max]`, `sprint`, `speed`, `maxStep`, `region: 'any'` |
| `'path'` | walks a polyline, agents spaced evenly along it. 2D points follow the ground; **3D points `[x, y, z]` set y exactly** (branches, bridges, the air — fliers pitch along climbs; distances are 3D). `loop: true` (default) closes it with a STRAIGHT segment from the last point back to the first (two points = back and forth; on narrow routes — trails, bridges — list the points out and back, `[...pts, ...pts.slice(1, -1).reverse()]`, so nobody cuts across roofs or through the air); `loop: false` walks it once, then they stand queued at the end; `loop: 'restart'` walks the open path and jumps back to the start (streams — they grow in / shrink out over the first and last 2 voxels) | `path: [[x,z] \| [x,y,z], …]`, `loop`, `spread` (lane jitter; `[start, end]` widens along the path), `wobble` (voxels of erratic sway) |
| `'follow'` | a chain: agent 0 follows `target`, each next one follows the previous | `target` (Actors, agent, Object3D, `[x,z]`, `t => [x,z]`, or `'id'` = the system created with that `id`), `spacing` |
| `'circle'` / `'flock'` (default for flyers) | circles `center` at its altitude (flock: one direction, wobbly) | `center: [x,y,z]`, `radius`, `wobble` |
| `'still'` | stays put: idle animation only (head looks around, tail sways; fliers on spots perch with folded wings) | `spots` |
| `'hop'` | perches on a spot for `idle` s, turns, flies a smooth arc to a free spot of its own set, lands and folds its wings (one spot: a short sally out and back). Also works for leapers | `spots`, `arc` (0.25 × distance; negative dips), `idle`, `speed`, `wobble` |
| `(ag, dt, t, actors) => {}` | your own: set `ag.x/y/z/heading/speed` (+ `pitch`, `air`) | `actors.ground.at/ok/region` |

Fliers with `'wander'` (or a 2D path) hover `altitude: [min,max]` above the ground. `on: 'water'` makes the walkable
surface water (ducks, fish, boats); swimmers float with their rig's `lift`.

**Explicit placements: `spots`.** `spots: [[x, y, z, headingDeg?], …]` — agent i starts at `spots[i % n]`;
`count` defaults to one per spot (`'hop'`: half of them, so there are free perches to fly to). `y` is exact
(no ground snapping: a branch top, a rock in a river, a ledge); `null` = on the top surface — careful: under a
tree that is the CANOPY, so give forest-floor animals an exact y. Heading in degrees,
0 = facing +z, 90 = facing +x (same as `rotation`); omitted = random. With `'still'`/`'hop'` and every `y`
given, no height field is sampled at all. Spots also seed `'wander'` (start there, wander that spot's own
connected area). In `stage.world()`, emits that differ only in `spots` (and count/seed/area/path/center/
radius) merge into one system; each emit keeps its own spot set, so hoppers stay among their own region's perches.

**What y means for anchored rigs** (`rig({ hang })`). Where y is explicit (a spot, a 3D path) it is the rig's
anchor: the feet for most creatures; for `gibbon` the **hand-hold line** — the underside of the branch it swings
under (the rig hangs ~7.5 voxels below it); for sitters whose tail or arms dangle (`langur`, `gibbon` with
`pose: 'sit'`) the **seat** — the branch top. `bat`s on spots hang head-down from y (a cave ceiling, a branch underside).

```js
// langurs sitting on a branch (y = its top), each facing its own way; a gibbon resting under it by one arm
stage.actors({ creature: 'langur', behavior: 'still', spots: [[12.5, 31, -4.5, 90], [15.5, 31, -4.5, 200], [18, 29, -3, 120]] });
stage.actors({ creature: 'gibbon', behavior: 'still', spots: [[20.5, 30, -4.5, 90]] });
// an elephant standing in the river (y = the river bed: no snapping), a tiger lying in wait in the grass
stage.actors({ creature: 'elephant', behavior: 'still', spots: [[40.5, -1, 18.5, 135]] });
stage.actors({ creature: 'tiger', behavior: 'still', spots: [[-22, null, 30, 60]] });
// a kingfisher darting low between river perches; hornbills flying from tree top to tree top
stage.actors({ creature: 'kingfisher', behavior: 'hop', spots: [[3.5, 4, 8.5], [12.5, 3, 7.5], [9.5, 5, 15.5]], arc: -0.15 });
stage.actors({ creature: 'hornbill', count: 2, behavior: 'hop', spots: treeTops, arc: 0.3, idle: [3, 8] });
// gibbons brachiating along a canopy route: y = just under the branches, hand over hand
stage.actors({ creature: 'gibbon', count: 3, variants: 2, behavior: 'path', path: [[-20, 42, 0], [-6, 44, 3], [8, 41, 1], [20, 43, -4], [8, 45, -9]] });
// bats streaming out of a cave mouth, climbing and dispersing over the forest, endlessly
stage.actors({ creature: 'bat', count: 30, behavior: 'path', loop: 'restart', spread: [0.4, 8], wobble: 1,
  path: [[-29, 4, 16], [-24, 5, 16], [-16, 10, 13], [-4, 18, 8], [12, 30, 0], [40, 45, -14]] });
// a boat cruising a loop on the lake (2D path on water; any one-part rig with swim: true)
stage.actors({ creature: 'canoe', on: 'water', behavior: 'path', path: [[0, 40], [30, 25], [55, 40], [30, 60]] });
// families linked by id (plain data — also from stage.world region emits): a sow and her piglets,
// an elephant mother and calf, an otter family swimming in line
stage.actors({ id: 'sow1', creature: 'boar', area: [[10, 10], [40, 30]] });
stage.actors({ creature: 'boar', options: { baby: true }, count: 4, behavior: 'follow', target: 'sow1' });
stage.actors({ id: 'mum', creature: 'elephant', area: riverbank });
stage.actors({ creature: 'elephant', options: { baby: true }, behavior: 'follow', target: 'mum' });
stage.actors({ id: 'otters', creature: 'otter', on: 'water', area: pool });
stage.actors({ creature: 'otter', count: 3, behavior: 'follow', target: 'otters', on: 'water', spacing: 1.5 });
```
`id`s must be unique; a follower may be created before its leader (resolved when it first steps).
Worked example of all of these: `voxel/lab/canopy_test.js` (`&solo=gibbon` etc. = a studio for one creature);
world merging: `voxel/lab/canopy_world.js`. Hop gotchas: flights are straight eased arcs — give perches a clear
line of sight (raise `arc` to clear foliage); a dipping `arc` below the perches can touch water.

**Ground.** Actors read the voxels of every model (`ground: 'auto'`; or pass a grid/group/number) once
at creation into a height field: they step up/down at most `maxStep` (1), treat water as a wall (unless
`on: 'water'`), walk through swaying tufts ≤ 2 voxels tall, and walk **under any overhang with at least
creature-height + 1 voxels of air beneath it** (walkers: 8, cats: 5) — tree canopies, awnings, arches,
bunting, bridges, porch roofs — whatever its material. Lower overhangs, bushes, walls, counters and
fences are obstacles. Wandering stays inside the largest connected walkable region of `area` (so
rooftops and closed courtyards are never used). Create actors **after** `stage.add` (and with `keepGrid` true — `world()`
handles this itself).

**Shadows.** `shadow: 'auto'` = real shadow-map shadows (when `look.sun.update` is `'always'`), else a soft
blob under each agent. Real shadows are cheap: only the agents are redrawn into the cached shadow map each
frame. Force with `true | 'blob' | false`.

**Variety & cost.** A rig's parts are merged into one geometry and drawn as one rigged InstancedMesh
(joint matrices live in a float texture): **one draw call per variant** (+1 in the shadow pass, or +1 for
all blob shadows) whether there are 1 or 500 agents. `variants: n` builds n rigs from different seeds
(varied clothes / coats); `options: [{ coat: 'black' }, { coat: 'white' }]` gives explicit variants;
`tints: ['#fff', '#fc9']` multiplies colors per instance for free. Per frame each agent costs one matrix
per part: measured 0.37 ms/frame of CPU for 400 agents (300 walkers + 100 cats) — hundreds are fine.
Creating a system samples the terrain once (~0.3 s for a 256×256 area).

**Reading/steering agents.** `const cats = stage.actors(...)`; `cats.agents[0]` is live
`{ x, y, z, heading, pitch, speed, air, state }` (`air`: 0 perched … 1 flying) — attach a light (`onUpdate(() => lamp.position.set(a.x, a.y + 3, a.z))`),
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
(opposite the legs), `wing` (flap about z; `anim.flap`, `flapSpeed`, `glide`; perched → `anim.fold`
`{ rx, ry, rz }` of the side +1 wing, default swept back along the body; butterflies `{ rz: 1.45 }` = closed
upright), `fin` (wiggle), `static`. For anything else give the part
`animate: ({ t, agent, moving, phase, air, hang, flap, rx, ry, rz }) => ({ rx, ry, rz, dx, dy, dz })` (role
angles in, your rotation about the pivot + an offset out) or `=> ({ matrix })` (a `THREE.Matrix4` rig-space
transform — chain joints: body → head/legs/wings; see `about()`/`chain()`/`birdPosture()` in `gen/canopy.js`:
birds pitching up when perched, the gibbon's pendulum swing). `air` (0 perched … 1 flying) blends postures.
`rig(parts, { scale, speed, stride, sprint, idle, lift, fly, swim, hang, center, anim })` — `hang`: the
rig-space y that sits on an explicit agent y (a hanger's grip, a sitter's seat; see above), `center`: the point
placed at the agent's x/z (the seat or the feet, so spots land right).

Shortcuts: most four-legged animals are one `quadruped({ width, length, legH, bodyH, headW, headH,
headD, snout, ears, tail, coat, pattern, scale, anim })` call (see `dog`/`sheep`/`pig` in creatures.js);
a vehicle or boat is a one-part rig — `rig([{ grid: g.rotated(1).recenter() }], { swim: true })` + `behavior: 'path'`
(the canoes in `lab/bigworld.js`). Register it (`defineCreature` with `habitat` + `example`) and it's
unit-tested by `tools/test.mjs` and shown in the catalog automatically.

Tips: keep creatures 2–4× chunkier than "realistic" (a cat ~10 voxels long at `scale: 0.5`); eyes are 1
dark voxel on the front face corners; contrasting belly/socks/ears read better than texture at this size.
