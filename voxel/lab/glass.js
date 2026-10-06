// Regression: glass ior/opacity per material, point-light shadows with sway, reflection with camera offset.
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD } = V;
const stage = new Stage({ look: ['cozy', { ground: { reflect: 0.6 } }], camera: { yaw: 35, pitch: 28, offset: [0.12, 0] } });
const P = new Palette({ ...NATURE, ...BUILD,
  clear: { color: '#cfe8ff', kind: 'glass', opacity: 0.0, ior: 1.6 },
  milky: { color: '#ffd0e0', kind: 'glass', opacity: 0.8 },
  floor: { color: '#c8b89a', jitter: 0.05, grid: 0.4 },
});
const g = new VoxelGrid(P);
g.box([-12, 0, -12], [12, 0, 12], 'floor');
g.box([-9, 1, -2], [-4, 8, 2], 'clear');
g.box([4, 1, -2], [9, 8, 2], 'milky');
g.box([-1, 1, -6], [1, 6, -4], 'brick');
V.bush(g, [0, 1, 6], { radius: 3 });
stage.add(g, { bake: { ao: true } });
stage.light({ position: [0, 12, 0], color: '#ffe0b0', intensity: 120, distance: 40, shadow: true });
stage.start();
