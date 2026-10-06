// Big-scene stress test: 16 regions built in parallel workers, clustered + frustum-culled meshes,
// instanced trees. ?region=d0,plaza builds a subset (how a subagent tests its own region).
import { Stage } from '../lib/index.js';
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
