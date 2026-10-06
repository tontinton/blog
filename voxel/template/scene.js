// {{TITLE}} — {{DESCRIPTION}}
// Docs: voxel/README.md and voxel/docs/ in the repo root.
import { Stage, VoxelGrid, Palette, NATURE, BUILD, rng, noise, tile } from '../lib/index.js';

const stage = new Stage({
  look: '{{LOOK}}',               // studio | daylight | pastel | golden | dreamy | neon | cozy | clay | winter
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
// ... build here ...

await stage.progress('Lighting', 0.8);
stage.add(g, { bake: { ao: true, light: true } });
stage.start();
