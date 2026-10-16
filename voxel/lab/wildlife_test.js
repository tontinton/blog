// Wildlife lab (lib/gen/wildlife.js): the Khao Sok ground & water creatures side by side, with a 7-voxel
// person for scale.
//   ?scene=wildlife_test                 standing still (idle animation: trunk curls, ears flap, tails…)
//   &mode=walk                           walking on the spot (treadmill: gait at their own speed)
//   &mode=free                           wandering freely (real behaviors)
//   &only=elephant,tapir                 subset (names from the roster below)
//   &heading=0.6                         facing (radians, 0 = +z)
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD } = V;
const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'still', only = q.get('only')?.split(','), heading = Number(q.get('heading') ?? 0.7);
const stage = new Stage({ look: q.get('look') ?? 'daylight', camera: { yaw: Number(q.get('yaw') ?? 30), pitch: Number(q.get('pitch') ?? 24) } });
const P = new Palette({ ...NATURE, ...BUILD, water: { color: '#4ab4c8', kind: 'water', opacity: 0.4 } });

// [label, creature, options, spacing (world voxels)]
const roster = [
  ['bull', 'elephant', { tusks: true }, 15], ['cow', 'elephant', { tusks: false, seed: 4 }, 14], ['calf', 'elephant', { baby: true }, 9],
  ['tapir', 'tapir', {}, 10], ['sunbear', 'sunbear', {}, 8], ['boar', 'boar', {}, 9], ['piglet', 'boar', { baby: true }, 5],
  ['muntjac', 'muntjac', { male: true }, 7], ['doe', 'muntjac', { male: false }, 6], ['tiger', 'tiger', {}, 12], ['macaque', 'macaque', {}, 5],
  ['pigtail', 'macaque', { kind: 'pigtail' }, 5], ['monitor', 'monitor', {}, 9], ['python', 'snake', { kind: 'python' }, 9],
  ['cobra', 'snake', { kind: 'cobra' }, 8], ['viper', 'snake', { kind: 'viper' }, 6], ['otter', 'otter', {}, 9],
].filter((r) => V.lookup('creature', r[1]) && (!only || only.includes(r[0]) || only.includes(r[1])));

// the first creature stands at the origin (close-ups: &target=0,4,0 --zoom 4), the person 4 voxels before it
const total = roster.reduce((s, r) => s + r[3], 0) + 8;
const x0 = -Math.round(roster[0][3] / 2) - 6, half = 12;
const g = new VoxelGrid(P);
V.tile(g, [x0 - 4, -half], [x0 + total + 4, half], { depth: 3, seed: 2 });
const water = roster.some((r) => r[1] === 'otter');
let x = x0 + 4;
V.person(g, [x - 2, 1, 3], { seed: 3 });                     // 7 voxels tall, for scale
const spots = roster.map((r) => { x += r[3] / 2 + (r === roster[0] ? 2 : 0); const p = [x, 0]; x += r[3] / 2; return p; });
const ot = roster.findIndex((r) => r[1] === 'otter');
if (water) V.pond(g, [spots[ot][0], 0], { radius: 6, depth: 3, shore: false });
stage.add(g, { bake: { ao: true, light: true } });

const pin = (px, pz, walk) => (ag, dt, t, A) => {
  ag.x = px; ag.z = pz; ag.heading = heading; ag.speed = walk ? ag.baseSpeed : 0;
  ag.y = A.ground ? A.ground.at(px, pz) : 1;
};
roster.forEach(([, creature, options], i) => {
  const [px, pz] = spots[i], w = creature === 'otter';
  stage.actors({ creature, options, seed: 5 + i, on: w ? 'water' : 'ground', area: [[px - 6, pz - 8], [px + 6, pz + 8]],
    ...(mode === 'free' ? {} : { behavior: pin(px, pz, mode === 'walk') }) });
});
stage.start();
