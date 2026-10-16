// Region for lab/canopy_world.js: emits spot/path/hop actors so world() merges them (one system per spec).
import { tile } from '../../lib/index.js';
export default function build(g, ctx) {
  const [[x0, , z0], [x1, , z1]] = ctx.box, cx = (x0 + x1) / 2;
  tile(g, [x0, z0], [x1, z1], { depth: 3, seed: 1 });
  g.box([x0 + 2, 1, z0 + 8], [x0 + 2, 12, z0 + 8], 'bark'); g.box([x1 - 2, 1, z0 + 8], [x1 - 2, 12, z0 + 8], 'bark');
  g.box([x0 + 3, 12, z0 + 8], [x1 - 3, 12, z0 + 8], 'bark');                    // branch: top y = 13, underside y = 12
  for (const [x, z] of [[x0 + 6, z1 - 6], [cx, z1 - 10], [x1 - 6, z1 - 5]]) g.box([x, 1, z], [x, 4, z], 'barkDark'); // perch stakes
  ctx.emit('actors', { creature: 'langur', behavior: 'still', spots: [[x0 + 5, 13, z0 + 8.5, 20], [cx, 13, z0 + 8.5, -30]] });
  ctx.emit('actors', { creature: 'kingfisher', behavior: 'hop', idle: [0.5, 1.5], spots: [[x0 + 6.5, 5, z1 - 5.5], [cx + 0.5, 5, z1 - 9.5], [x1 - 5.5, 5, z1 - 4.5]] });
  ctx.emit('actors', { creature: 'gibbon', behavior: 'path', path: [[cx + 2, 12, z0 + 8.5], [x1 - 4, 12, z0 + 8.5]] });
  // a sow and her piglets: linked by id (plain data), never merged with the other region's family
  ctx.emit('actors', { id: `${ctx.name}-sow`, creature: 'boar', area: [[x0 + 4, z0 + 12], [x1 - 4, z1 - 14]], seed: ctx.seed % 1000 });
  ctx.emit('actors', { creature: 'boar', options: { baby: true }, count: 4, behavior: 'follow', target: `${ctx.name}-sow` });
}
