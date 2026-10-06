import { Stage, VoxelGrid, Palette } from '../lib/index.js';
const stage = new Stage({ look: 'cozy', camera: { yaw: 35, pitch: 30 } });
const P = new Palette({
  floor: { color: '#7a5235', jitter: 0.06, grid: 0.5 },
  wall: { color: '#6d6a72', jitter: 0.08, grid: 0.35 },
  wood: { color: '#8a5a32', jitter: 0.05 },
  bed: { color: '#7fa6c8', jitter: 0.03 },
  lamp: { color: '#ffc070', emissive: 5, flicker: 0.3, light: { radius: 9, intensity: 1.4 } },
  fire: { colors: ['#ff8a2a', '#ffb347', '#ff5a1a'], emissive: 6, flicker: 0.6, flickerSpeed: 1.5, light: { color: '#ff8a3a', radius: 10, intensity: 1.6 } },
  neon: { color: '#46e0ff', emissive: 5, light: { radius: 7, intensity: 1 } },
});
const g = new VoxelGrid(P);
g.box([0, 0, 0], [23, 0, 23], 'floor');
g.box([0, 1, 0], [0, 14, 23], 'wall');
g.box([0, 1, 0], [23, 14, 0], 'wall');
g.box([14, 1, 14], [20, 3, 21], 'wood');
g.box([14, 4, 14], [20, 4, 21], 'bed');
g.box([4, 1, 1], [8, 4, 2], 'wall');
g.box([5, 1, 2], [7, 2, 2], 'fire');
g.set(12, 6, 1, 'lamp');
g.set(1, 6, 12, 'lamp');
g.box([1, 10, 4], [1, 10, 20], 'neon');
g.box([10, 1, 10], [11, 2, 11], 'wood');
await stage.progress('meshing', 0.5);
stage.add(g, { bake: { ao: true, light: true } });
stage.particles({ preset: 'dust', count: 120 });
stage.start();
