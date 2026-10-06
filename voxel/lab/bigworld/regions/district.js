// One 96×96 city district: paving, a block grid of adobe houses, canal edges, trees (instanced), people.
// Used by many regions with different options (ctx.options.x, z = region origin).
import { house, person, lamppost } from '../../../lib/index.js';
const S = 96;
export default function build(g, ctx) {
  const { x: X, z: Z } = ctx.options, R = ctx.rng;
  // ground slab + canals on two sides
  g.box([X, -4, Z], [X + S - 1, -1, Z + S - 1], 'bank');
  g.box([X, 0, Z], [X + S - 1, 0, Z + S - 1], 'paving');
  g.box([X, -3, Z], [X + 5, 0, Z + S - 1], 0);
  g.box([X, -3, Z], [X + 5, -1, Z + S - 1], 'canal');
  g.box([X, -3, Z], [X + S - 1, 0, Z + 5], 0);
  g.box([X, -3, Z], [X + S - 1, -1, Z + 5], 'canal');
  // house blocks
  for (let bx = X + 10; bx < X + S - 14; bx += 16) for (let bz = Z + 10; bz < Z + S - 14; bz += 16) {
    if (R.chance(0.15)) { // garden plot instead of a house
      g.box([bx, 0, bz], [bx + 11, 0, bz + 11], 'chinampa');
      for (let i = 0; i < 3; i++) ctx.instance(R.pick(['palm', 'palm2', 'oak', 'cypress']), [bx + R.int(1, 10), 1, bz + R.int(1, 10)], R.int(0, 3) * 90, R.range(0.8, 1.1));
      continue;
    }
    const w = R.int(8, 12), d = R.int(8, 12), h = R.int(4, 7);
    house(g, [bx, 1, bz], { w, d, h, wall: 'adobe', roof: R.chance(0.6) ? 'flatRoof' : 'roofTile', roofType: R.chance(0.6) ? 'flat' : 'gable', posts: 'adobeTrim', beam: 'adobeTrim', lit: 0.25, windows: 1, seed: R.int(0, 1e6) });
    if (R.chance(0.5)) ctx.instance(R.pick(['palm', 'palm2']), [bx + w + 1, 1, bz + R.int(0, d)], R.int(0, 3) * 90);
  }
  // streetlife
  for (let i = 0; i < 14; i++) person(g, [X + R.int(8, S - 8), 1, Z + R.int(8, S - 8)], { seed: R.int(0, 1e6), side: R.pick(['+x', '-x', '+z', '-z']) });
  for (let i = 0; i < 4; i++) lamppost(g, [X + 8 + i * 24, 1, Z + 8], { height: 4, lamp: 'brazier', pole: 'bank' });
  // animated life: walkers wander the streets (every district's merge into one system), a canoe plies the canal
  ctx.emit('actors', { creature: 'walker', count: 10, variants: 4, area: [[X + 7, Z + 7], [X + S - 2, Z + S - 2]] });
  if (R.chance(0.7)) ctx.emit('actors', { creature: 'canoe', behavior: 'path', path: [[X + 2.5, Z + 8], [X + 2.5, Z + S - 4]], seed: R.int(1, 1e6) });
}
