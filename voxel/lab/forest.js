// Worked example: forest cottage tile (reference 5) — green toy diorama with an ivy roof.
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD, rng, hash3 } = V;

const stage = new Stage({
  look: ['daylight', { background: { type: 'radial', colors: ['#3f8f45', '#2a6a33'], radius: 1.1 }, voxel: { bevel: 0.08 } }],
  camera: { yaw: 38, pitch: 32 },
});
const P = new Palette({
  ...NATURE, ...BUILD,
  grass: { colors: ['#4fae3a', '#5cbc44', '#47a234'], jitter: 0.04 },
  side1: { color: '#3c9a35' }, side2: { color: '#2f7f2c' }, side3: { color: '#246824' },
  wallLog: { color: '#b08a3a', jitter: 0.05, grid: 0.35 },
  thatch: { color: '#b7a03e', jitter: 0.06 },
  ivy: { colors: ['#35a032', '#46b83c', '#2d8a2a'], jitter: 0.05, sway: 0.15 },
  porch: { color: '#7a5034' }, porchDark: { color: '#5a3824' },
  win: { color: '#5fb8d8', roughness: 0.2, emissive: 0.4 },
  bloom: { colors: ['#f4f4ee', '#e8eae2'], jitter: 0.03, bevel: 1.5 },
  pond: { color: '#3a9a9a', kind: 'water', opacity: 0.45 },
  lily: { color: '#3c8a30' },
  stoneW: { colors: ['#9a9a9a', '#8a8a8a', '#a8a8a8'], grid: 0.5 },
  teal: { colors: ['#2f9f8a', '#3ab49a', '#289080'], sway: 0.3 },
});
const g = new VoxelGrid(P);
const R = rng(8);
// tile with banded green sides
V.tile(g, [-22, -18], [22, 18], { depth: 5, top: 'grass', topDepth: 1, layers: [['side1', 1], ['side2', 2], ['side3', 9]] });
// cottage: log walls, thatch roof covered in ivy, porch
const hx = -2, hz = -12;
V.walls(g, [hx, 1, hz], [hx + 14, 6, hz + 10], 'wallLog', { posts: 'porchDark', floor: 'porchDark' });
V.opening(g, [hx, 1, hz], [hx + 14, 6, hz + 10], { side: '+z', at: 3, w: 2, h: 3, y: 0, fill: 'door' });
V.opening(g, [hx, 1, hz], [hx + 14, 6, hz + 10], { side: '+z', at: 8, w: 2, h: 2, y: 2, fill: 'win', frame: 'porchDark' });
V.opening(g, [hx, 1, hz], [hx + 14, 6, hz + 10], { side: '+x', at: 4, w: 2, h: 2, y: 2, fill: 'win', frame: 'porchDark' });
g.roof([hx, 7, hz], [hx + 14, 7, hz + 10], 'thatch', { axis: 'x', overhang: 2, gable: 'wallLog' });
V.cover(g, { on: ['thatch'], with: 'ivy', amount: 0.55, scale: 0.2, seed: 3 });
V.vines(g, { on: ['thatch'], with: ['ivy'], density: 0.08, length: 4 });
g.box([hx + 10, 7, hz + 2], [hx + 11, 16, hz + 3], 'stoneBrick');
V.smoke(g, [hx + 10, 17, hz + 2], { height: 8, drift: [0.3, 0.1] });
// porch with railing and steps
g.box([hx, 0, hz + 11], [hx + 14, 1, hz + 14], 'porch');
V.fence(g, [[hx, 2, hz + 14], [hx + 6, 2, hz + 14]], { post: 'porchDark', rail: 'porch', every: 3 });
V.fence(g, [[hx + 10, 2, hz + 14], [hx + 14, 2, hz + 14]], { post: 'porchDark', rail: 'porch', every: 2 });
g.box([hx + 7, 1, hz + 15], [hx + 9, 1, hz + 15], 'stoneW');
// well
V.well(g, [-14, 1, -6], { wall: 'stoneW', roof: 'roofSlate' });
// trees: pines + round trees + teal tree behind the house
for (const [x, z, h] of [[-19, -14, 15], [-12, 8, 12], [-18, 3, 11], [-6, 13, 9], [17, 13, 10]]) V.pine(g, [x, 1, z], { height: h, seed: x * 7 + z });
V.oak(g, [-17, 1, -2], { height: 12, style: 'clumps', seed: 4 });
V.oak(g, [8, 1, -17], { height: 16, radius: 6, leaves: ['teal'], style: 'clumps', seed: 6 });
// ponds with lily pads
for (const [x, z, r] of [[-8, 2, 3.5], [-2, 7, 2.5], [4, 3, 2]]) V.pond(g, [x, z], { radius: r, depth: 1, water: 'pond', shore: false, bed: 'dirtDark', seed: x });
g.surface((x, y, z, id) => { if (id === P.pond && hash3(x, y, z) < 0.12) g.set(x, y + 1, z, P.lily); });
// white flowering bushes
for (const [x, z] of [[12, 6], [16, -2], [-10, -12], [19, 8], [6, 10]]) V.bush(g, [x, 1, z], { radius: 2, leaves: ['bloom'], seed: x + z });
V.scatter(g, (x, y, z, R) => V.grassTuft(g, [x, y, z], { R, shades: ['grassDark', 'grassLight'], height: R.int(1, 2) }), { on: ['grass'], density: 0.07 });
stage.add(g, { bake: { ao: true, light: true } });
stage.start();
