// Exercises runtime APIs: setView, updateLook, rebuild, remove, particles.set, spot light, loadVox.
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD, loadVox } = V;
const stage = new Stage({ look: 'studio' });
const P = new Palette({ ...NATURE, ...BUILD });
const g = new VoxelGrid(P);
V.tile(g, [-10, -10], [10, 10], { depth: 3 });
const base = stage.add(g);
const extra = new VoxelGrid(P); extra.box([0, 1, 0], [2, 3, 2], 'brick');
const ex = stage.add(extra);
stage.remove(ex);                                   // removed again
const tower = new VoxelGrid(P); tower.box([-2, 1, -2], [2, 4, 2], 'stoneBrick');
const tw = stage.add(tower);
tower.box([-1, 5, -1], [1, 8, 1], 'roofTile');      // edit after add…
stage.rebuild(tw);                                   // …then re-mesh
const { grid: vg } = await loadVox('./test.vox', { materials: { 2: { emissive: 3 } } });
stage.add(vg, { position: [5, 1, 5] });
const p = stage.particles({ preset: 'snow', count: 300 });
p.set({ size: 0.5, speed: 0.2 });
stage.light({ type: 'spot', position: [-8, 12, 8], target: [0, 0, 0], color: '#ffd080', intensity: 200, distance: 40, angle: 30 });
stage.updateLook({ sun: { azimuth: 120 }, background: { color: '#cfd8e0' } });
stage.setView({ yaw: 20, pitch: 40, zoom: 1.2 });
await stage.start();
console.log('api ok', stage.models.length, JSON.stringify(vg.bounds()));
