// Animation: actors (cats, dog, sheep in a pen, walkers on a path, ducklings following mum, koi, birds,
// butterflies) + stage.animate (windmill blades).
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD, rng } = V;
const stage = new Stage({ look: 'daylight', camera: { yaw: 38, pitch: 34 } });
const P = new Palette({ ...NATURE, ...BUILD, water: { color: '#4ab4c8', kind: 'water', opacity: 0.4 } });
const g = new VoxelGrid(P);
const R = rng(5);
V.tile(g, [-32, -24], [32, 24], { depth: 6, hills: (x, z) => (x > 18 && z < -8 ? 2 : 0) });
V.pond(g, [14, 10], { radius: 8, depth: 3, seed: 2 });
V.house(g, [-26, 1, -18], { w: 11, d: 8, h: 5, seed: 3 });
V.trail(g, [[-20, -9], [-20, 4], [6, 4], [6, -12], [-20, -12]], { width: 2 });
// sheep pen
const pen = [[-30, 1, 8], [-12, 1, 8], [-12, 1, 22], [-30, 1, 22], [-30, 1, 8]];
V.fence(g, pen, { height: 2 });
V.oak(g, [0, 1, -18], { height: 12 }); V.pine(g, [26, 3, -18], { height: 13 }); V.bush(g, [-6, 1, 14]);
V.well(g, [-4, 1, -4]);
V.scatter(g, (x, y, z, R) => (R() < 0.3 ? V.flower(g, [x, y, z], { R }) : V.grassTuft(g, [x, y, z], { R })), { on: ['grass'], density: 0.05 });
// windmill tower (blades are a separate, animated model)
g.cylinder([24, 3, -6], 3, 12, 'stone'); g.cone([24, 15, -6], 4, 4, 'roofTile');
stage.add(g, { bake: { ao: true, light: true } });
const blades = new VoxelGrid(P);
for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= 7; k++) blades.box([dx * k - (dy ? 1 : 0), dy * k - (dx ? 1 : 0), 0], [dx * k + (dy ? 1 : 0), dy * k + (dx ? 1 : 0), 0], k > 2 ? 'plank' : 'plankDark');
blades.set(0, 0, 0, 'metal');
stage.animate(stage.add(blades, { position: [24.5, 12.5, -1.5], pivot: [0.5, 0.5, 0.5], fit: false }), { spin: [0, 0, 0.9] });

stage.actors({ creature: 'cat', count: 3, variants: 3, area: [[-24, -10], [10, 8]], seed: 3 });
stage.actors({ creature: 'dog', options: { coat: 'golden' }, area: [[-10, -12], [8, 6]], seed: 4 });
stage.actors({ creature: 'sheep', count: 5, area: [[-29, 9], [-13, 21]], seed: 5 });
stage.actors({ creature: 'walker', count: 4, variants: 4, behavior: 'path', path: [[-20, -9], [-20, 4], [6, 4], [6, -12], [-20, -12]], spread: 0.4, seed: 6 });
const mum = stage.actors({ creature: 'duck', on: 'water', area: [[8, 4], [20, 16]], seed: 7 });
stage.actors({ creature: 'duck', options: { baby: true }, count: 3, behavior: 'follow', target: mum, on: 'water', seed: 8 });
stage.actors({ creature: 'fish', count: 3, on: 'water', area: [[8, 4], [20, 16]], seed: 9 });
stage.actors({ creature: 'bird', count: 5, center: [0, 30, 0], radius: 22, seed: 10 });
stage.actors({ creature: 'butterfly', count: 4, variants: 4, behavior: 'wander', altitude: [1.5, 4], area: [[-10, 6], [6, 20]], seed: 11 });
stage.start();
