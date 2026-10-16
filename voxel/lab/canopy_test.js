// Canopy creatures + the new actor behaviors (lib/gen/canopy.js, actors.js): gibbons brachiating along a 3D path
// under the branches, a langur and a hornbill sitting on spots, hornbills hopping between tree tops, a kingfisher
// hopping between 3 stakes over the pond, bats streaming out of a cave (path, loop 'restart', spread, wobble),
// birdwings and dragonflies, a boat looping the pond (path on water). A person for scale.
//   ?scene=canopy_test     &t=4 to freeze time
//   &solo=gibbon           a studio for one creature: a branch (top y = 11, underside y = 10), a person for scale,
//                          the creature sitting on it, hanging under it, moving along it, flying, on the ground
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD, rig, defineCreature, boat } = V;
const stage = new Stage({ look: 'daylight', camera: { yaw: 38, pitch: 30 } });
const P = new Palette({ ...NATURE, ...BUILD, water: { color: '#3aa8a0', kind: 'water', opacity: 0.45 }, caveDark: { color: '#141210' } });
const g = new VoxelGrid(P);
const solo = new URLSearchParams(location.search).get('solo');
if (solo) {
  V.tile(g, [-18, -10], [18, 10], { depth: 3, seed: 2 });
  g.box([-16, 1, 0], [-16, 10, 0], 'bark'); g.box([16, 1, 0], [16, 10, 0], 'bark');
  g.box([-15, 10, 0], [15, 10, 0], 'bark');                      // the branch: top y = 11, underside y = 10
  V.person(g, [-14, 1, 5], { side: '+z', seed: 4 });
  stage.add(g, { bake: { ao: true } });
  const e = V.lookup('creature', solo), fly = e.value({}).fly;
  const modes = new URLSearchParams(location.search).get('modes')?.split(',');   // &modes=still,hop,path,circle,wander
  const spotsQ = new URLSearchParams(location.search).get('spots');                  // &spots=[[0,11,0.5,0]] overrides 'still' spots
  const A = (o) => (!modes || modes.includes(o.behavior)) && stage.actors({ creature: solo, seed: 3, ...o, ...(spotsQ && o.behavior === 'still' ? { spots: JSON.parse(spotsQ) } : {}) });
  if (solo === 'gibbon') {
    A({ behavior: 'still', spots: [[-11, 10, 0.5, 20]] });                                   // hanging by one arm
    A({ behavior: 'still', spots: [[-6, 11, 0.5, 20]], options: { pose: 'sit' } });        // sitting on top
    A({ behavior: 'path', path: [[0, 10, 0.5], [14, 10, 0.5]], options: { coat: 'black' } }); // brachiating
    A({ behavior: 'wander', area: [[-8, 4], [8, 9]] });                                      // walking on the ground
  } else if (solo === 'langur') {
    A({ behavior: 'still', spots: [[-10, 11, 0.5, 20], [-5, 11, 0.5, -30], [0, 11, 0.5, 60]] });
    A({ behavior: 'path', path: [[4, 11, 0.5], [14, 11, 0.5]], options: { pose: 'walk' } });
    A({ behavior: 'wander', area: [[-8, 4], [8, 9]], options: { pose: 'walk' } });
  } else {
    A({ behavior: 'still', spots: [[-10, 11, 0.5, 30], [-6, 11, 0.5, -40]] });                // perched
    A({ behavior: 'hop', spots: [[0, 11, 0.5], [6, 11, 0.5], [12, 11, 0.5]], count: 2, arc: 0.3, idle: [0.6, 1.2] });
    if (fly) A({ behavior: 'circle', center: [0, 17, 0], radius: 7, count: 2 });
    if (modes?.includes('fly')) stage.actors({ creature: solo, seed: 3, behavior: (ag) => Object.assign(ag, { x: 0, y: 15, z: 0, heading: 0.5, speed: 0 }) }); // hovering in place: inspect the flight pose
    A({ behavior: 'wander', area: [[-8, 4], [8, 9]], altitude: [1, 3], count: 2 });
  }
  stage.start();
} else {
V.tile(g, [-36, -28], [36, 28], { depth: 5, seed: 2 });
V.pond(g, [14, 12], { radius: 10, depth: 3, seed: 3 });

// three rainforest trees with long horizontal limbs between them (the gibbon route runs under these)
const trees = [[-26, -12, 30], [-6, -16, 28], [14, -12, 26]];
for (const [x, z, h] of trees) {
  g.box([x - 1, 1, z - 1], [x + 1, h, z + 1], 'bark');
  g.box([x - 2, 1, z - 2], [x + 2, 2, z + 2], 'barkDark');
  V.foliage(g, [{ c: [x, h + 3, z], r: 6 }, { c: [x + 4, h + 1, z + 2], r: 4 }, { c: [x - 4, h + 1, z - 1], r: 4 }], { leaves: ['leafDark', 'leaf', 'leafLight'], seed: x });
}
const LIMB = 22;                                                   // limbs at y = 22: their underside is the hand-hold line
g.tube([[-25, LIMB, -12], [-16, LIMB, -14], [-7, LIMB, -16]], 'bark', { r: 0.5 });
g.tube([[-5, LIMB, -16], [4, LIMB, -14], [13, LIMB, -12]], 'bark', { r: 0.5 });
g.box([14, 14, -11], [14, 14, -3], 'bark');                        // a lower branch toward the viewer (langur, hornbill)
// a dead snag for a perched hornbill
g.box([-20, 1, 6], [-20, 13, 6], 'barkDark'); g.box([-21, 13, 6], [-18, 13, 6], 'barkDark');
// a limestone outcrop with a cave mouth facing +x (bats)
g.box([-34, 1, 10], [-26, 12, 24], 'stone'); g.box([-33, 13, 12], [-28, 15, 22], 'stoneDark');
g.box([-27, 1, 14], [-26, 7, 18], 0); g.box([-30, 1, 14], [-28, 7, 18], 'caveDark');
// kingfisher stakes in the pond
const stakes = [[8, 3, 9], [19, 4, 7], [15, 3, 19]];
for (const [x, h, z] of stakes) g.box([x, -3, z], [x, h, z], 'barkDark');
V.scatter(g, (x, y, z, R) => (R() < 0.35 ? V.flower(g, [x, y, z], { R }) : V.grassTuft(g, [x, y, z], { R })), { on: ['grass'], density: 0.04 });
V.person(g, [2, 1, 6], { side: '+x', seed: 4 });                  // scale: 7 voxels tall
stage.add(g, { bake: { ao: true, light: true } });

// gibbons: path y = the limbs' underside; one swings back and forth along each limb (groups: one system)
const limbA = [[-23, LIMB, -12.5], [-16, LIMB, -14.5], [-9, LIMB, -16.5]], limbB = [[-3, LIMB, -16.5], [4, LIMB, -14.5], [11, LIMB, -12.5]];
stage.actors({ creature: 'gibbon', options: [{ coat: 'black' }, { coat: 'buff' }], behavior: 'path', seed: 3,
  groups: [{ path: [...limbA, limbA[1]], count: 1 }, { path: [...limbB, limbB[1]], count: 1 }] });
stage.actors({ creature: 'gibbon', behavior: 'still', spots: [[14.5, 14, -10.5, 270]], options: { coat: 'buff' }, seed: 5 });   // resting, one arm
stage.actors({ creature: 'gibbon', behavior: 'still', spots: [[14.5, 15, -7.5, 90]], options: { pose: 'sit', coat: 'black' }, seed: 6 });
// langur on the low branch, hornbill perched on the snag, two more hopping between the tree tops
stage.actors({ creature: 'langur', behavior: 'still', spots: [[14.5, 15, -4, 100]], seed: 2 });
stage.actors({ creature: 'hornbill', behavior: 'still', spots: [[-19.5, 14, 6.5, 60]], seed: 3 });
stage.actors({ creature: 'hornbill', count: 2, behavior: 'hop', spots: trees.map(([x, z, h]) => [x + 0.5, h + 10, z + 0.5]), arc: 0.25, idle: [2, 5], seed: 4 });
// kingfisher darting between the stakes (dips toward the water)
stage.actors({ creature: 'kingfisher', behavior: 'hop', spots: stakes.map(([x, h, z], i) => [x + 0.5, h + 1, z + 0.5, i * 90]), arc: -0.15, idle: [1, 2.5], seed: 7 });
// bats streaming out of the cave mouth and dispersing over the canopy
stage.actors({ creature: 'bat', count: 16, behavior: 'path', loop: 'restart', spread: [0.4, 6], wobble: 0.8, seed: 8,
  path: [[-29, 4, 16], [-24, 5, 16], [-16, 10, 13], [-4, 18, 8], [12, 30, 0], [34, 40, -12]] });
stage.actors({ creature: 'birdwing', count: 3, variants: 2, behavior: 'wander', altitude: [1.5, 4], area: [[-12, 0], [4, 20]], seed: 9 });
stage.actors({ creature: 'dragonfly', count: 4, variants: 2, behavior: 'wander', altitude: [0.8, 2], area: [[6, 4], [22, 20]], seed: 10 });

// a small boat looping the pond (path on water)
defineCreature('canopy_test_boat', () => {
  const Q = new Palette(BUILD), b = new VoxelGrid(Q);
  boat(b, [0, 0, 0], { length: 7, width: 3, height: 1, hull: 'plankDark', deck: 'plank' });
  return rig([{ name: 'hull', grid: b.rotated(1).recenter() }], { palette: Q, swim: true, lift: -0.4, speed: [1.2, 1.6] });
}, { summary: 'test boat', habitat: 'water' });
stage.actors({ creature: 'canopy_test_boat', on: 'water', behavior: 'path', path: [[9, 12], [14, 7], [20, 12], [14, 17]], seed: 11 });
stage.start();
}
