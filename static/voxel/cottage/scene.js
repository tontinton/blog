// Cottage — the "hello world" of the voxel lib: a tile, a house, some trees, a pond, glowing
// windows, chimney smoke and fireflies at golden hour. Everything comes from ../lib.
import { Stage, VoxelGrid, Palette, NATURE, BUILD, tile, house, oak, pine, pond, reeds, flower, fence, lamppost, smoke, scatter, grassTuft, cover, rock } from '../lib/index.js';

const stage = new Stage({
  look: ['golden', {
    background: { colors: ['#f4cfa4', '#e6a983', '#b07a86'] },
    sun: { elevation: 30, azimuth: 60 },
    ground: { opacity: 0.3 },
  }],
  camera: { yaw: 38, pitch: 30 },
  ui: { title: 'Cottage', subtitle: 'A hillside home at golden hour' },
});

const P = new Palette({
  ...NATURE,
  ...BUILD,
  roof: { color: '#7a4a3a', jitter: 0.06 },
  ivy: { colors: ['#4f8a3a', '#5f9c44'], jitter: 0.05, sway: 0.2 },
  water: { color: '#5ab8c4', kind: 'water', opacity: 0.45 },
});
const g = new VoxelGrid(P);
await stage.progress('Laying the ground', 0.2);

tile(g, [-18, -18], [18, 18], { depth: 6, hills: 2.5, corner: 2, layers: [['dirt', 2], ['dirtDark', 1], ['stone', 99]] });
pond(g, [9, 9], { radius: 4.5, depth: 2 });
reeds(g, [5, 1, 12], { count: 7, seed: 2 });

await stage.progress('Raising the cottage', 0.4);
const { chimneyTop } = house(g, [-13, 1, -12], { w: 12, d: 9, h: 5, wall: 'plaster', roof: 'roof', lit: 0.9, chimney: true, seed: 3 });
cover(g, { on: ['roof'], with: 'ivy', amount: 0.35, seed: 4 });
smoke(g, chimneyTop, { height: 9, drift: [0.5, 0.15], seed: 5 });

await stage.progress('Planting', 0.6);
oak(g, [10, 1, -10], { height: 13, seed: 7 });
pine(g, [-14, 1, 8], { height: 17, seed: 8 });
pine(g, [-9, 1, 13], { height: 12, seed: 9 });
rock(g, [14, 1, 2], { size: [2.5, 2, 2], seed: 10, moss: 'moss' });
fence(g, [[-2, 1, 16], [12, 1, 16]], { every: 3 });
lamppost(g, [-2, 1, 3], { arm: '+x', height: 5 });
scatter(g, (x, y, z, R) => (R.chance(0.2) ? flower(g, [x, y, z], { R, height: 1, shape: 'dot' }) : grassTuft(g, [x, y, z], { R })), { on: ['grass'], density: 0.08, seed: 11 });

await stage.progress('Lighting', 0.8);
stage.add(g, { bake: { ao: true, light: true } });
stage.particles({ preset: 'fireflies', count: 45 });
stage.start();
