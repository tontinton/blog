// one generator, 4 seeds side by side: ?scene=gens&gen=oak
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD } = V;
const q = new URLSearchParams(location.search);
const name = q.get('gen') || 'oak';
const stage = new Stage({ look: q.get('lk') || 'studio', camera: { yaw: 30, pitch: 25 } });
const P = new Palette({ ...NATURE, ...BUILD });
const g = new VoxelGrid(P);
const S = 22;
V.tile(g, [-2 * S, -S / 2], [2 * S - 1, S / 2], { depth: 2 });
const opts = JSON.parse(q.get('o') || '{}');
for (let i = 0; i < 4; i++) {
  const x = -1.5 * S + i * S;
  const p = [Math.round(x), 1, 0];
  if (name === 'house') V.house(g, [p[0] - 5, 1, -4], { seed: i, ...opts });
  else if (name === 'cloud' || name === 'smoke') V[name](g, [p[0], 4, 0], { seed: i + 1, ...opts });
  else if (name === 'truss') V.truss(g, [p[0], 1, 0], [p[0], 16, 0], 'metal', opts);
  else V[name](g, p, { seed: i + 1, ...opts });
}
stage.add(g, { bake: { ao: true, light: true } });
stage.start();
