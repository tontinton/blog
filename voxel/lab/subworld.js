// Parallel-authoring dry run: each region in subworld/regions/ was written by a different subagent from
// docs/big-scenes.md + subworld/layout.js only. ?region=market builds one region.
import { Stage } from '../lib/index.js';
import { REGIONS } from './subworld/layout.js';
const stage = new Stage({ look: ['golden', { sun: { elevation: 30 } }], camera: { yaw: 35, pitch: 32, maxZoom: 10 } });
await stage.world({
  palette: './subworld/palette.js', assets: './subworld/assets.js',
  regions: REGIONS.map((r) => ({ name: r.name, module: `./subworld/regions/${r.name}.js`, box: r.box, options: { x0: r.x0, x1: r.x1 } })),
});
stage.start();
