import { Stage, VoxelGrid, Palette, rng, noise } from '../lib/index.js';

const stage = new Stage({ look: 'daylight', ui: { title: 'Lab', subtitle: 'testing the voxel lib' } });
const P = new Palette({
  grass: { color: '#79b84a', jitter: 0.06, noise: { color: '#5e9c3c', scale: 0.12 } },
  dirt: { color: '#8a5a3a', jitter: 0.06 },
  stone: { color: '#9a9aa0', jitter: 0.08, grid: 0.4 },
  wood: { color: '#a0683a', jitter: 0.05 },
  leaf: { colors: ['#3f8f3a', '#4ea044', '#5db34d'], sway: 0.6 },
  lamp: { color: '#ffd28a', emissive: 4, light: { radius: 8, intensity: 1.2 } },
  water: { color: '#3fb0c0', kind: 'water', opacity: 0.25 },
});
const g = new VoxelGrid(P);
const N = noise(3);
g.box([0, 0, 0], [31, 2, 31], 'dirt');
g.box([0, 3, 0], [31, 3, 31], 'grass');
g.box([18, 3, 18], [27, 3, 27], 'water');
g.box([4, 4, 4], [12, 9, 12], 'stone', { hollow: true });
g.box([5, 9, 5], [11, 9, 11], 0);
g.roof([4, 10, 4], [12, 10, 12], 'wood', { type: 'gable' });
g.cylinder([24, 4, 8], 1, 6, 'wood');
g.sphere([24, 12, 8], 4, 'leaf');
g.set(14, 4, 14, 'lamp');
await stage.progress('meshing', 0.5);
stage.add(g, { bake: { ao: true, light: true } });
stage.particles({ preset: 'fireflies', count: 40 });
stage.start();
