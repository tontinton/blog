// Hook test: cel-shaded light bands + rim light via the `light` hook.
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD } = V;
const stage = new Stage({ look: ['toon', { outline: { amount: 0.9 } }], camera: { yaw: 40, pitch: 28 } });
const P = new Palette({ ...NATURE, ...BUILD });
const g = new VoxelGrid(P);
V.tile(g, [-12, -12], [12, 12], { depth: 3 });
V.house(g, [-6, 1, -6], { w: 10, d: 8, h: 5, chimney: true });
V.oak(g, [7, 1, 6], { height: 11, seed: 2 }); V.pine(g, [-8, 1, 7], { height: 12 });
stage.add(g, { bake: { ao: true }, hooks: {
  light: `{
    float l = dot(reflectedLight.directDiffuse, vec3(0.333)) / max(dot(diffuseColor.rgb, vec3(0.333)), 1e-3);
    float band = l > 0.6 ? 1.0 : l > 0.2 ? 0.55 : 0.2;
    reflectedLight.directDiffuse = diffuseColor.rgb * band * 2.2;
    float rim = pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.0);
    reflectedLight.indirectDiffuse += diffuseColor.rgb * rim * 0.6;
  }`,
}});
stage.start();
