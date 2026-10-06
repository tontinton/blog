// Orchard (lead's region): grass, the road, rows of apple trees, a hay field, a farmhouse, sheep.
import { tile, house, fence, trail } from '../../../lib/index.js';
import { ROAD, Z0, Z1 } from '../layout.js';
export default function build(g, ctx) {
  const { x0, x1 } = ctx.options, R = ctx.rng;
  tile(g, [x0, Z0], [x1, Z1], { depth: 6, seed: 3 });
  g.box([x0, 0, ROAD.z0], [x1, 0, ROAD.z1], ROAD.m);
  for (let x = x0 + 6; x < x1 - 4; x += 9) for (let z = Z0 + 6; z < ROAD.z0 - 5; z += 9) ctx.instance('appleTree', [x + R.int(-1, 1), 1, z + R.int(-1, 1)], R.int(0, 3) * 90, R.range(0.85, 1.1));
  g.box([x0 + 4, 0, ROAD.z1 + 6], [x0 + 26, 0, Z1 - 4], 'dirt');
  for (let x = x0 + 4; x <= x0 + 26; x += 2) g.box([x, 1, ROAD.z1 + 7], [x, 1, Z1 - 5], 'hay');
  house(g, [x0 + 34, 1, ROAD.z1 + 8], { w: 11, d: 9, h: 5, roof: 'thatch', chimney: true, lit: 0.6, seed: R.int(0, 1e6) });
  const pen = [[x0 + 48, 1, ROAD.z1 + 6], [x1 - 3, 1, ROAD.z1 + 6], [x1 - 3, 1, Z1 - 3], [x0 + 48, 1, Z1 - 3], [x0 + 48, 1, ROAD.z1 + 6]];
  fence(g, pen);
  ctx.emit('actors', { creature: 'sheep', count: 5, area: [[x0 + 50, ROAD.z1 + 8], [x1 - 5, Z1 - 5]] });
  ctx.emit('actors', { creature: 'walker', count: 3, variants: 3, area: [[x0 + 2, ROAD.z0], [x1, ROAD.z1]] });
}
