import { Stage, VoxelGrid, Palette, rng, hash3 } from '../lib/index.js';
const stage = new Stage({ look: 'pastel', camera: { type: 'persp', fov: 30, yaw: 30, pitch: 22, zoom: 1.6 } });
const P = new Palette({
  pink: { color: '#f4b8c8', jitter: 0.02 },
  white: { color: '#fbf4f0', jitter: 0.02 },
  inner: { color: '#e88aa5' },
  eye: { color: '#3a2420', roughness: 0.2 },
  eyeHi: { color: '#6a4a44', roughness: 0.2 },
  grass: { colors: ['#9cc65a', '#8ab84c', '#a8d064'], sway: 0.8 },
  ground: { color: '#9ac85e', jitter: 0.04 },
  dirt: { color: '#b07a50' },
  carrot: { color: '#f08a2a' }, leaf: { color: '#5aa83a' },
  flower: { colors: ['#c9a0f0', '#f0e080', '#b8e0b0'] },
});
const g = new VoxelGrid(P);
const R = rng(5);
g.box([-16, -3, -16], [16, -1, 16], 'dirt');
g.box([-16, 0, -16], [16, 0, 16], 'ground');
// body
g.box([-5, 1, -4], [5, 9, 4], 'pink');
g.box([-3, 2, 4], [3, 7, 4], 'white');
// head
g.box([-6, 10, -5], [6, 20, 5], 'pink');
g.box([-2, 10, 5], [2, 14, 5], 'white');
g.box([-5, 14, 6], [-2, 17, 6], 'eye'); g.box([2, 14, 6], [5, 17, 6], 'eye');
g.box([-4, 16, 6], [-3, 17, 6], 'eyeHi'); g.box([3, 16, 6], [4, 17, 6], 'eyeHi');
g.box([-1, 13, 6], [0, 13, 6], 'inner');
// ears
g.box([-5, 21, -1], [-2, 30, 1], 'pink'); g.box([2, 21, -1], [5, 30, 1], 'pink');
g.box([-4, 22, 2], [-3, 29, 2], 'inner'); g.box([3, 22, 2], [4, 29, 2], 'inner');
// paws
g.box([-6, 1, 3], [-4, 3, 6], 'white'); g.box([4, 1, 3], [6, 3, 6], 'white');
g.box([-1, 5, 5], [1, 10, 6], 'carrot'); g.box([-1, 11, 5], [1, 12, 7], 'leaf');
// grass + flowers
for (let x = -16; x <= 16; x++) for (let z = -16; z <= 16; z++) {
  if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
  const h = hash3(x, 1, z);
  if (h < 0.18) { const t = 1 + Math.floor(hash3(x, 2, z) * 4); g.box([x, 1, z], [x, t, z], 'grass'); }
  else if (h < 0.2) { g.box([x, 1, z], [x, 3, z], 'leaf'); g.box([x - 1, 4, z - 1], [x + 1, 4, z + 1], 'flower'); }
}
stage.add(g, { bake: { ao: true } });
stage.particles({ preset: 'cubes', count: 30 });
stage.start();
