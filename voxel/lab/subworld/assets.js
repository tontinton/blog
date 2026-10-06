// Instanced / prop assets (built at the origin, base at y = 0): ctx.instance('appleTree', [x, 1, z], rotDeg, scale)
// or ctx.emit('prop', { asset: 'rowboat', position: [x, y, z], animate: { bob: 0.2, sway: 0.04 } }).
import { oak, pine, boat, crate, barrel } from '../../lib/index.js';
export default {
  appleTree: (g) => { oak(g, [0, 0, 0], { height: 8, radius: 3.5, seed: 4 }); g.paint((x, y, z, id) => (id === g.palette.leaf && ((x * 7 + y * 3 + z * 5) % 11 === 0) ? g.palette.apple : undefined)); },
  oak: (g) => oak(g, [0, 0, 0], { height: 11, seed: 2 }),
  pine: (g) => pine(g, [0, 0, 0], { height: 13, seed: 5 }),
  rowboat: (g) => boat(g, [-3, 0, -1], { length: 7, width: 3, height: 1 }),
  crates: (g) => { crate(g, [0, 0, 0]); crate(g, [2, 0, 0]); crate(g, [1, 2, 0]); barrel(g, [4, 0, 1]); },
};
