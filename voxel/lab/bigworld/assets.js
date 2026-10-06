// Instanced assets: built once, drawn many times via ctx.instance(name, [x, y, z], rotY, scale).
import { palm, oak, pine } from '../../lib/index.js';
export default {
  palm: (g) => palm(g, [0, 0, 0], { height: 13, seed: 4 }),
  palm2: (g) => palm(g, [0, 0, 0], { height: 10, seed: 9, lean: 0.5 }),
  oak: (g) => oak(g, [0, 0, 0], { height: 9, seed: 2 }),
  cypress: (g) => pine(g, [0, 0, 0], { height: 14, radius: 2.5, seed: 5 }),
};
