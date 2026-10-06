import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD, rng } = V;
const stage = new Stage({ look: 'neon', camera: { yaw: 45, pitch: 32 } });
const P = new Palette({ ...NATURE, ...BUILD,
  pave: { colors: ['#6a6f8a', '#5f6480', '#737896'], jitter: 0.05, grid: 0.25 },
  base: { color: '#23263d' },
  wall: { color: '#7a7f9e', jitter: 0.08, noise: { color: '#5d6080', scale: 0.3 } },
  hull: { color: '#1f2c6a' }, hullRed: { color: '#8a1f2a' }, deck: { color: '#d8d0c0' },
  pinkWin: { color: '#ff7ad0', emissive: 3.5, light: { radius: 6, intensity: 0.7 } },
  yellowWin: { color: '#ffe9a8', emissive: 3, light: { radius: 5, intensity: 0.6 } },
  container: { colors: ['#d8306a', '#c02a5a'], jitter: 0.05, grid: 0.3 },
});
const g = new VoxelGrid(P);
const R = rng(2);
g.box([-34, -3, -34], [34, -1, 34], 'base');
g.box([-34, 0, -34], [34, 0, 34], 'pave');
// neon trim around the edge
g.box([-33, 0, -33], [33, 0, 33], 'neonCyan', { walls: true });
g.box([-32, 0, -32], [32, 0, 32], 'pave', { walls: true });
// dock basin
g.box([-14, -2, -10], [24, 0, 10], 0);
g.box([-14, -2, -10], [24, -2, 10], 'water');
// buildings
g.box([-30, 1, -30], [-12, 22, -14], 'wall');
V.facade(g, [-30, 3, -13], [-12, 20, -13], { lit: ['pinkWin', 'yellowWin'], every: [3, 3], size: [2, 1], chance: 0.7, seed: 1 });
V.facade(g, [-11, 3, -30], [-11, 20, -14], { lit: ['pinkWin', 'yellowWin'], every: [3, 3], size: [2, 1], chance: 0.7, seed: 2 });
g.box([-30, 23, -30], [-12, 23, -14], 'neonCyan', { walls: true });
g.box([0, 1, -32], [22, 30, -16], 'wall');
V.facade(g, [0, 3, -15], [22, 28, -15], { lit: ['pinkWin'], every: [3, 2], size: [2, 1], chance: 0.8, seed: 3 });
// ship
for (let y = -1; y <= 4; y++) { const w = 6 - Math.max(0, 1 - y); g.box([-8, y, -w + 1], [16, y, w - 1], y < 1 ? 'hullRed' : 'hull'); }
for (let i = 0; i < 6; i++) g.box([16 + i, i, -5 + i], [16 + i, 4, 5 - i], 'hull');
g.box([-8, 5, -4], [14, 5, 4], 'deck');
g.box([-6, 6, -3], [-1, 11, 3], 'deck');
V.facade(g, [-6, 7, 4], [-1, 10, 4], { lit: ['yellowWin'], every: [2, 2], chance: 0.9, seed: 4 });
// crane
V.truss(g, [26, 1, -6], [26, 26, -6], 'metal', { size: 4 });
V.truss(g, [26, 26, -6], [26, 26, 14], 'metal', { size: 4 });
g.box([26, 25, -6], [26, 25, 14], 'neonPink');
g.box([25, 22, -10], [30, 25, -7], 'metalDark');
V.facade(g, [25, 23, -11], [30, 24, -11], { lit: ['yellowWin'], every: [2, 2], chance: 1 });
// containers
for (let i = 0; i < 5; i++) g.box([-28 + i * 5, 1, 16], [-25 + i * 5, 3 + (i % 2) * 3, 24], 'container');
stage.add(g, { bake: { ao: true, light: true } });
stage.start();
