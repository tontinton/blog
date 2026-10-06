// Big-scene stress test: 16 regions built in parallel workers, clustered + frustum-culled meshes,
// instanced trees, actors emitted by regions (walkers merge into one system; canoes on the canals use a
// custom creature registered here). ?region=d0,plaza builds a subset (how a subagent tests its own region).
import { Stage, defineCreature, rig, Palette, VoxelGrid, BUILD, boat } from '../lib/index.js';

// custom creature: a canoe (one static part) — regions use it by name: ctx.emit('actors', { creature: 'canoe', … })
defineCreature('canoe', () => {
  const P = new Palette(BUILD), g = new VoxelGrid(P);
  boat(g, [0, 0, 0], { length: 9, width: 3, height: 1, hull: 'plankDark', deck: 'plank' });
  return rig([{ name: 'hull', grid: g.rotated(1).recenter() }], { palette: P, swim: true, lift: -0.4, speed: [1.2, 2] });
}, { summary: 'dugout canoe', habitat: 'water' });
const stage = new Stage({ look: ['golden', { sun: { update: 'static' }, fog: { amount: 0.25, near: 0.3, far: 1.6 } }], camera: { yaw: 40, pitch: 32, maxZoom: 12 } });
const regions = [];
for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
  const x = (i - 2) * 96, z = (j - 2) * 96, plaza = i === 2 && j === 2;
  const name = plaza ? 'plaza' : `d${i}${j}`;
  regions.push({ name, module: plaza ? './bigworld/regions/plaza.js' : './bigworld/regions/district.js', options: { x, z }, box: [[x, -8, z], [x + 95, 120, z + 95]] });
}
const world = await stage.world({ palette: './bigworld/palette.js', assets: './bigworld/assets.js', regions });
window.WORLD_STATS = world.stats;
stage.start();
