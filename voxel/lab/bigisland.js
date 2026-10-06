// Stress test: big floating cube island (reference 2) — performance + dense foliage.
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD, rng, noise, hash3 } = V;

const stage = new Stage({ look: 'dreamy', camera: { yaw: 40, pitch: 26 } });
const P = new Palette({
  ...NATURE, ...BUILD,
  rock: { colors: ['#8a7a78', '#7a6b6a', '#988886'], jitter: 0.06, noise: { color: '#6e5f60', scale: 0.08 } },
  cave: { color: '#1e5a48', emissive: 0.25 },
  glowMoss: { colors: ['#4fbf7a', '#3aa868'], emissive: 1.2, light: { color: '#5fe0a0', radius: 8, intensity: 0.8 } },
  pinkLeaf: { colors: ['#c86a78', '#d88090', '#b85a6a'], jitter: 0.05, sway: 0.4 },
  water: { color: '#47c6b4', kind: 'water', opacity: 0.18 },
  wood: { color: '#7a4e30', jitter: 0.05 }, roofW: { color: '#6a4028', jitter: 0.06, grid: 0.3 },
});
const g = new VoxelGrid(P);
const R = rng(11), N = noise(5);
const S = 48; // half size
const t0 = performance.now();
// rock cube with two big arches carved through
g.fill([-S, -2 * S, -S], [S, -1, S], (x, y, z) => {
  const ax = Math.hypot(x - 8, (y + 2 * S) * 0.75) < S * 0.8 + N.simplex3(x * 0.08, y * 0.08, z * 0.08) * 5; // arch through z
  const az = Math.hypot(z + 6, (y + 2 * S) * 0.75) < S * 0.72 + N.simplex3(z * 0.08, y * 0.08, x * 0.08) * 5; // arch through x
  return ax || az ? 0 : 'rock';
});
// glowing moss on the arch ceilings, darker teal walls inside
g.paint((x, y, z, id) => {
  if (id !== P.rock) return;
  const open = !g.get(x, y - 1, z) || !g.get(x + 1, y, z) || !g.get(x - 1, y, z);
  const inside = Math.abs(x) < S - 3 && Math.abs(z) < S - 3;
  if (open && inside) return hash3(x, y, z) < 0.35 ? 'glowMoss' : 'cave';
});
await stage.progress('carving', 0.2);
// soil + grass top
g.box([-S, 0, -S], [S, 1, S], 'dirt');
g.box([-S, 2, -S], [S, 2, S], 'grass');
// pond cutaway at the front corner
g.box([-6, -10, 8], [S, 2, S], 0);
g.box([-6, -10, 8], [S, 1, S], 'water');
g.box([-6, -11, 8], [S, -11, S], 'sand');
await stage.progress('building', 0.35);
// cabin
V.house(g, [-20, 3, -26], { w: 16, d: 12, h: 7, wall: 'wood', roof: 'roofW', lit: 0.8, chimney: true, seed: 2 });
// trees everywhere
for (let i = 0; i < 70; i++) {
  const x = R.int(-S + 3, S - 3), z = R.int(-S + 3, S - 3);
  if (x > -8 && z > 6) continue; // pond
  if (x > -24 && x < 0 && z > -30 && z < -10) continue; // cabin
  const k = R();
  if (k < 0.35) V.palm(g, [x, 3, z], { height: R.int(12, 20), R });
  else if (k < 0.6) V.oak(g, [x, 3, z], { height: R.int(9, 15), R, leaves: ['pinkLeaf'], style: 'clumps' });
  else if (k < 0.85) V.bush(g, [x, 3, z], { radius: R.range(2, 4), R });
  else V.rock(g, [x, 3, z], { size: [R.range(2, 4), R.range(2, 4), R.range(2, 4)], R, stone: ['rock'] });
}
// foliage spilling down the sides
for (let i = 0; i < 90; i++) {
  const side = R.int(0, 3), t = R.range(-S, S), y = R.int(-2 * S + 6, 0);
  const p = side === 0 ? [S, y, t] : side === 1 ? [-S, y, t] : side === 2 ? [t, y, S] : [t, y, -S];
  if (side === 2 && t > -6 && y > -12) continue;
  V.bush(g, p, { radius: R.range(2.5, 5), R, leaves: R.chance(0.5) ? ['pinkLeaf'] : ['leafDark', 'leaf', 'leafLight'] });
}
await stage.progress('grass', 0.5);
V.scatter(g, (x, y, z, R) => V.grassTuft(g, [x, y, z], { R }), { on: ['grass'], density: 0.05 });
for (let i = 0; i < 6; i++) V.cloud(g, [R.int(-S, S), R.int(10, 40), R.int(-S, S)], { length: R.int(14, 24), R });
const t1 = performance.now();
console.log('generate ms', Math.round(t1 - t0), 'voxels', g.count());
await stage.progress('meshing', 0.7);
stage.add(g, { bake: { ao: true, light: true } });
console.log('mesh', JSON.stringify(stage.stats()));
stage.particles({ preset: 'fireflies', count: 120 });
stage.start();
