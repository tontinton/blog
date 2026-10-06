import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD, rng } = V;
const stage = new Stage({ look: 'dreamy', camera: { yaw: 40, pitch: 28 } });
const P = new Palette({ ...NATURE, ...BUILD,
  grass: { color: '#7aa84a', jitter: 0.07, noise: { color: '#5f9040', scale: 0.1 } },
  water: { color: '#3fc0b0', kind: 'water', opacity: 0.2 },
});
const g = new VoxelGrid(P);
const R = rng(3);
// square column with a pond on top
g.box([-20, -30, -20], [20, -1, 20], (x, y, z) => (y > -3 ? 'dirt' : R.chance(0.5) ? 'stone' : 'stoneDark'));
g.box([-20, 0, -20], [20, 0, 20], 'grass');
// carve a pond reaching the front edge (cutaway)
g.box([-6, -6, 4], [20, 0, 20], 0);
g.box([-6, -6, 4], [20, -1, 20], 'water');
g.box([-6, -7, 4], [20, -7, 20], 'sand');
V.house(g, [-16, 1, -16], { w: 10, d: 8, h: 5, chimney: true, lit: 0.6, wall: 'plank', roof: 'plankDark' });
V.palm(g, [10, 1, -10], { height: 16, seed: 2 });
V.palm(g, [-12, 1, 0], { height: 13, seed: 5 });
V.blossom(g, [12, 1, -16], { height: 15, seed: 1 });
V.bush(g, [-2, 1, -6], { seed: 3, leaves: ['blossomDark', 'blossom'] });
V.bush(g, [4, 1, 0], { seed: 4 });
V.rock(g, [6, -1, 10], { size: [2, 3, 2], seed: 2 });
V.scatter(g, (x, y, z, R) => V.grassTuft(g, [x, y, z], { R }), { on: ['grass'], density: 0.06 });
V.cloud(g, [-16, 22, 14], { length: 14, seed: 2 });
V.cloud(g, [16, 26, -12], { length: 12, seed: 3 });
stage.add(g, { bake: { ao: true, light: true } });
stage.particles({ preset: 'fireflies', count: 60 });
stage.start();
