// Exercises hooks, instances, pivot animation, dynamic lights and pick().
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD } = V;
const stage = new Stage({ look: 'neon', camera: { yaw: 40, pitch: 30 } });
const P = new Palette({ ...NATURE, ...BUILD, rune: { color: '#2a2f55', custom: [2, 0, 0, 0] }, hub: '#888' });
const g = new VoxelGrid(P);
V.tile(g, [-16, -16], [16, 16], { depth: 3, top: 'cobble', layers: [['stoneDark', 9]] });
g.box([-3, 1, -3], [3, 10, 3], 'rune');
g.box([-2, 11, -2], [2, 11, 2], 'hub');
stage.add(g, { bake: { ao: true }, hooks: {
  emissive: 'emis += vec3(0.2, 0.9, 1.0) * mc.x * (0.5 + 0.5 * sin(uTime * 3.0 + cell.y * 0.6));',
}});
// windmill blade rotating around its hub via pivot
const blade = new VoxelGrid(P);
blade.box([-8, 0, 0], [8, 0, 0], 'plank'); blade.box([0, -8, 0], [0, 8, 0], 'plank'); blade.set(0, 0, -1, P.hub);
const b = stage.add(blade, { pivot: [0, 0, 0], position: [0, 16, 4] });
stage.onUpdate((t) => { b.rotation.z = t * 0.8; });
// instanced trees
const tree = new VoxelGrid(P);
V.pine(tree, [0, 0, 0], { height: 9, seed: 3 });
stage.add(tree, { instances: [[-12, 1, -12], [12, 1, -12, 45], [-12, 1, 12, 90, 0.8], [12, 1, 12, 0, 1.2]] });
stage.light({ position: [8, 4, 8], color: '#ff4fb8', intensity: 40, distance: 20 });
await stage.start();
const r = stage.renderer.domElement.getBoundingClientRect();
console.log('pick', JSON.stringify(stage.pick(r.left + r.width / 2, r.top + r.height / 2)?.voxel), stage.pick(r.left + r.width / 2, r.top + r.height / 2)?.name);
