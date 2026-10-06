// {{TITLE}} — {{DESCRIPTION}}
// Docs: voxel/README.md and voxel/docs/ in the repo root.
import { Stage, VoxelGrid, Palette, NATURE, BUILD, rng, noise, tile } from '../lib/index.js';

const stage = new Stage({
  // preset name, or ['preset', { overrides }] — presets: studio daylight pastel golden dreamy neon cozy night
  // rainy spooky desert winter toon clay. Tweak live with ?debug and paste "copy look JSON" here.
  look: '{{LOOK}}',
  camera: { yaw: 40, pitch: 30 },  // type: 'persp' + fov for perspective
  ui: { title: '{{TITLE}}', subtitle: '{{DESCRIPTION}}' },
});

const P = new Palette({
  ...NATURE,
  ...BUILD,
  // your own materials: name: { color, jitter, emissive, light, sway, kind: 'water', ... }
});
const g = new VoxelGrid(P);
const R = rng(1);
await stage.progress('Building', 0.3);

tile(g, [-12, -12], [12, 12], { depth: 5 });
// ... build here: shapes are grid methods (g.box, g.sphere, g.tube, g.roof, g.layers, g.ascii…),
// generators are functions (house(g, p, opts), oak(g, p), pine, palm, rock, pond, fence, person…).
// Y is up, box ranges are inclusive, the tile's top is y = 0 so build from y = 1.

await stage.progress('Lighting', 0.8);
stage.add(g, { bake: { ao: true, light: true } });
// stage.particles({ preset: 'fireflies' });   // dust snow rain embers petals leaves cubes smoke mist sparkles bubbles
stage.start();
