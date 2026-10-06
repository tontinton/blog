// Boats, a pier, cars and street lamps at dusk.
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD } = V;
const stage = new Stage({ look: 'golden', camera: { yaw: 40, pitch: 34 } });
const P = new Palette({ ...NATURE, ...BUILD,
  sea: { color: '#2f8fa8', kind: 'water', opacity: 0.4 }, road: { color: '#4a4a52', jitter: 0.04 }, line: '#e8e0c0',
  hullBlue: { color: '#2a4a8a' }, hullRed: { color: '#b0303a' }, white: '#efeae0', carBlue: '#3a6ad0', carYellow: '#e8b830',
});
const g = new VoxelGrid(P);
g.box([-24, -6, -20], [24, -1, 20], 'sand');
g.box([-24, -5, -20], [24, -1, 4], 'sea');            // sea in the front half (+z is toward the camera… sea at -z)
g.box([-24, -1, 5], [24, 0, 20], 'stoneBrick');        // quay
g.box([-24, 1, 8], [24, 1, 14], 'road'); g.box([-24, 1, 11], [24, 1, 11], (x) => (x % 4 < 2 ? 'line' : 'road'));
V.bridge(g, [-4, 0, 4], [-4, 0, -14], { width: 3 });  // pier
V.boat(g, [2, -3, -10], { length: 16, width: 7, height: 3, hull: 'hullBlue', hullTop: 'white', deck: 'plankLight', cabin: { m: 'white' }, mast: 8 });
V.boat(g, [-20, -3, -6], { length: 10, width: 5, height: 2, hull: 'hullRed', hullTop: 'white' });
V.car(g, [-14, 2, 9], { color: 'carBlue' });
V.car(g, [8, 2, 12], { color: 'carYellow' });
for (const x of [-18, -6, 6, 18]) V.lamppost(g, [x, 1, 15], { arm: '-z', height: 6 });
V.house(g, [-22, 1, 16], { w: 12, d: 4, h: 6, wall: 'plaster', lit: 0.7, windows: 3, roofType: 'shed' });
V.house(g, [2, 1, 16], { w: 14, d: 4, h: 8, wall: 'brick', lit: 0.7, windows: 3, roofType: 'flat' });
for (let i = 0; i < 5; i++) V.person(g, [-10 + i * 5, 1, 6], { seed: 20 + i, side: i % 2 ? '-z' : '+x' });
stage.add(g, { bake: { ao: true, light: true } });
stage.start();
