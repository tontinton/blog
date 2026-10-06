// Stress test: cozy loft room cutaway (reference 1).
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD, rng } = V;

const stage = new Stage({ look: 'cozy', camera: { yaw: 45, pitch: 30 } });
const P = new Palette({
  ...NATURE, ...BUILD,
  wallA: { color: '#6f7184', jitter: 0.05 }, wallB: { color: '#7d7f93', jitter: 0.05 }, wallC: { color: '#62647a', jitter: 0.05 },
  mortar: { color: '#3f4050', jitter: 0.03 },
  plankA: { color: '#8c5a33', jitter: 0.04 }, plankB: { color: '#7a4c2a', jitter: 0.04 }, plankC: { color: '#9a663a', jitter: 0.04 },
  beam: { color: '#5a3820', jitter: 0.05 },
  rug: { color: '#5f8fb8', jitter: 0.02, roughness: 1 }, rugTrim: { color: '#e8e2d0', jitter: 0.02 },
  banner: { color: '#3d8fd0', jitter: 0.02, roughness: 1 }, bannerGold: { color: '#e8c050', metalness: 0.5, roughness: 0.4 },
  moon: { color: '#9cc8ff', emissive: 1.6, light: { radius: 10, intensity: 0.7 } },
  sheet: { color: '#a8c8e0', jitter: 0.02, roughness: 1 },
});
const g = new VoxelGrid(P);
const R = rng(4);
const W = 36, H = 30;
// floor planks, stone walls
V.bricks(g, [0, -1, 0], [W - 1, 0, W - 1], { axis: 'y', size: [6, 1], stagger: 3, mortar: null, stones: ['plankA', 'plankB', 'plankC'] });
V.bricks(g, [-2, -1, -2], [W - 1, H, -1], { size: [4, 3], mortar: 'mortar', stones: ['wallA', 'wallB', 'wallC'] });
V.bricks(g, [-2, -1, 0], [-1, H, W - 1], { size: [4, 3], mortar: 'mortar', stones: ['wallA', 'wallB', 'wallC'] });
// corner + top beams
g.box([-2, H + 1, -2], [W - 1, H + 1, -1], 'beam'); g.box([-2, H + 1, -2], [-1, H + 1, W - 1], 'beam');
// windows
V.opening(g, [0, 0, -2], [W - 1, H, -1], { side: '-z', at: 24, w: 5, h: 7, y: 18, fill: 'moon', frame: 'beam' });
V.opening(g, [-2, 0, 0], [-1, H, W - 1], { side: '-x', at: 6, w: 4, h: 6, y: 4, fill: 'moon', frame: 'beam' });
// loft
const LY = 14, LZ = 15;
V.bricks(g, [6, LY - 1, 0], [W - 1, LY, LZ], { axis: 'y', size: [6, 1], stagger: 3, mortar: null, stones: ['plankA', 'plankB', 'plankC'] });
g.box([6, LY - 2, LZ], [W - 1, LY - 2, LZ], 'beam');
for (const x of [6, 20, W - 1]) g.box([x, 1, LZ], [x, LY - 2, LZ], 'beam');
V.fence(g, [[6, LY + 1, LZ], [W - 1, LY + 1, LZ]], { post: 'beam', rail: 'plankB', height: 2, every: 4 });
V.stairs(g, [1, 1, LZ + 14], '-z', LY, 'plankA', { width: 4, side: 'beam' });
// loft furniture
V.bed(g, [24, LY + 1, 2], { w: 8, d: 5, frame: 'beam', sheet: 'paper', blanket: 'sheet', pillow: 'paper' });
V.bookshelf(g, [8, LY + 1, 0], { w: 8, h: 8, m: 'beam', seed: 2, books: ['fabricRed', 'banner', 'paper', 'moss', 'plankLight', 'bannerGold'] });
V.table(g, [17, LY + 1, 2], { w: 3, d: 3, h: 3, m: 'plankC', leg: 'beam' });
g.set(18, LY + 4, 3, P.candle);
// ground floor
V.fireplace(g, [24, 1, 0], '+z', { w: 9, h: 7, stone: 'wallB' });
g.box([25, 8, 0], [31, 12, 1], 'wallC');
V.table(g, [15, 1, 22], { w: 7, d: 5, h: 3, m: 'plankC', leg: 'beam' });
g.set(17, 4, 24, P.candle); g.set(20, 4, 23, P.candle);
g.box([18, 4, 25], [19, 4, 25], 'fabricRed');
V.chair(g, [14, 1, 24], '+x', { m: 'beam' }); V.chair(g, [23, 1, 24], '-x', { m: 'beam' });
g.box([10, 1, 18], [27, 1, 31], (x, y, z) => (x === 10 || x === 27 || z === 18 || z === 31 ? 'rugTrim' : 'rug'));
V.crate(g, [30, 1, 20], { size: 3 }); V.crate(g, [30, 4, 21], { size: 2 });
V.barrel(g, [32, 1, 27], { height: 4, radius: 1.6 });
V.lamppost(g, [8, 1, 30], { height: 2, pole: 'beam', lamp: 'candle' });
// hanging lantern under the loft
g.box([14, LY - 4, LZ - 1], [14, LY - 3, LZ - 1], 'metalDark'); g.set(14, LY - 5, LZ - 1, P.lamp);
// banner with a crest
g.ascii([0, 26, 4], `
  BBBBBBB
  BBBYBBB
  BYYYYYB
  BBBYBBB
  BBBYBBB
  BBBBBBB
  BBBBBBB
  B.B.B.B`, { B: 'banner', Y: 'bannerGold' }, { plane: 'zy' });
await stage.progress('meshing', 0.6);
stage.add(g, { bake: { ao: { radius: 8 }, light: true } });
stage.particles({ preset: 'dust', count: 150 });
stage.particles({ preset: 'embers', count: 25, box: [[25, 1, 1], [31, 8, 3]] });
stage.start();
