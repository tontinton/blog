// Lab: jungle.js generators at real scale next to people.
//   ?scene=jungle_test&part=giants|trees|small|dead|forest|hills|seeds|all  (&seed= &look= &above=y)
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD } = V;
const q = new URLSearchParams(location.search);
const part = q.get('part') ?? 'giants';
const stage = new Stage({ look: q.get('look') ?? 'golden', camera: { yaw: 38, pitch: 30 } });
const P = new Palette({ ...NATURE, ...BUILD, ...V.JUNGLE, ...V.UNDERSTORY, ...V.KARST, ...V.THAI,
  water: { color: '#3aa89a', kind: 'water', opacity: 0.45 }, forestFloor: { color: '#4a5a2a', jitter: 0.06, noise: { color: '#3e4a24', scale: 0.2 } } });
const g = new VoxelGrid(P);
const people = (pts) => pts.forEach(([x, z], i) => V.person(g, [x, 1, z], { seed: i + 3, side: '+z' }));

if (part === 'giants') {
  V.tile(g, [-40, -26], [40, 26], { depth: 3, top: 'forestFloor' });
  V.dipterocarp(g, [-18, 1, -4], { seed: Number(q.get('seed') ?? 3) });
  V.strangler(g, [18, 1, 0], { seed: Number(q.get('seed') ?? 3) });
  people([[-8, 6], [12, 9]]);
} else if (part === 'trees') {
  V.tile(g, [-46, -14], [46, 14], { depth: 3, top: 'forestFloor' });
  ['round', 'layered', 'spreading', 'tall'].forEach((style, i) => V.jungleTree(g, [-36 + i * 20, 1, 0], { style, height: 26, seed: i + 1, flowers: i === 0 ? 'flameFlower' : undefined }));
  V.jungleTree(g, [44, 1, -6], { style: 'round', height: 22, seed: 9, flowers: 'yellowFlower', flowerAmount: 0.6 });
  people([[-30, 8], [-10, 8], [10, 8], [30, 8]]);
} else if (part === 'small') {
  V.tile(g, [-20, -12], [20, 12], { depth: 3, top: 'forestFloor' });
  V.bamboo(g, [-11, 1, -2], { seed: 3 });
  V.bamboo(g, [-2, 1, -6], { seed: 5, height: 23 });
  V.banana(g, [7, 1, 2], { seed: 3, fruit: true });
  V.banana(g, [13, 1, -4], { seed: 7 });
  people([[2, 7], [10, 8]]);
} else if (part === 'dead') {
  g.box([-20, -8, -14], [20, -8, 14], 'sand');
  g.box([-20, -7, -14], [20, 0, 14], 'water');
  for (const [x, z, h, s] of [[-10, -4, 16, 1], [-2, 4, 9, 2], [6, -6, 19, 3], [12, 6, 6, 4], [-14, 8, 11, 5]]) V.deadTree(g, [x, 0, z], { bed: -7, height: h, seed: s });
  V.boat(g, [2, -1, 9], { length: 12, width: 5, height: 3 });
} else if (part === 'hills') {
  // rolling terrain with a lake: the forest stands on whatever ground there is and skips the water
  V.terrain(g, [-50, -50], [49, 49], { base: -6, height: 22, scale: 0.035, seed: 4, top: 'forestFloor', water: 'water', waterLevel: 2 });
  const res = V.rainforest(g, [-50, -50], [49, 49], { seed: Number(q.get('seed') ?? 5), height: [16, 26] });
  console.log('rainforest trees', res.trees.length, 'emergents', res.emergents.length);
} else if (part === 'seeds') {
  V.tile(g, [-60, -16], [60, 16], { depth: 3, top: 'forestFloor' });
  for (let i = 0; i < 4; i++) V.dipterocarp(g, [-45 + i * 30, 1, -2], { seed: 10 + i, height: 55 + i * 6 });
  for (let i = 0; i < 3; i++) V.strangler(g, [-36 + i * 36, 1, 12], { seed: 20 + i, height: 35 + i * 7 });
  people([[-40, 14], [0, 26]]);
} else if (part === 'all') {
  // composite: forest with a clearing (bamboo, bananas, people), a strangler fig at its edge, a drowned-forest lake
  V.tile(g, [-50, -40], [49, 39], { depth: 4, top: 'forestFloor', hills: 2, seed: 2 });
  g.box([22, -3, -40], [49, 6, 39], 0); g.box([22, -3, -40], [49, -3, 39], 'sand'); g.box([22, -2, -40], [49, -1, 39], 'water');
  const fig = [4, 1, -14];
  V.strangler(g, [fig[0], g.top(fig[0], fig[2]) + 1, fig[2]], { seed: 4, height: 40 });
  V.rainforest(g, [-50, -40], [21, 39], { seed: 7, avoid: [[[-6, 4], [14, 28]], [[-4, -24], [12, -4]]], emergents: [[-36, -26], [-12, -30]], border: true });
  for (const [x, z, s] of [[-3, 6, 1], [11, 7, 2]]) V.bamboo(g, [x, g.top(x, z) + 1, z], { seed: s });
  for (const [x, z, s] of [[2, 22, 3], [7, 24, 5], [-2, 18, 8]]) V.banana(g, [x, g.top(x, z) + 1, z], { seed: s });
  for (const [x, z, h, s] of [[30, -20, 16, 1], [36, -4, 9, 2], [28, 12, 19, 3], [42, 22, 7, 4], [40, -30, 12, 5], [33, 30, 11, 6]]) V.deadTree(g, [x, -1, z], { bed: -3, height: h, seed: s });
  people([[4, 14], [8, 16], [0, -4]]);
} else if (part === 'forest') {
  const S = Number(q.get('size') ?? 80) / 2;
  V.tile(g, [-S, -S], [S - 1, S - 1], { depth: 3, top: 'forestFloor', hills: Number(q.get('hills') ?? 4) });
  // a river and a clearing to avoid
  g.box([-S, -2, 6], [S - 1, 12, 11], 0); g.box([-S, -2, 6], [S - 1, -1, 11], 'water');
  const res = V.rainforest(g, [-S, -S], [S - 1, S - 1], { seed: Number(q.get('seed') ?? 3), avoid: [[[-10, -30], [4, -18]]], emergents: Number(q.get('emergents') ?? 3) });
  V.house(g, [-8, g.top(-3, -24) + 1, -28], { w: 9, d: 7, h: 4, seed: 2 });
  people([[-2, -19], [0, 13]]);
  console.log('rainforest trees', res.trees.length, 'emergents', res.emergents.length, g.count(), res.emergents.map((e) => e.base.join(',') + '/' + e.top[1]).join(' '));
}
if (q.has('above')) g.box([-60, -10, -60], [60, Number(q.get('above')), 60], 0);   // debug: keep only voxels above y
stage.add(g, { bake: { ao: true } });
stage.start();
