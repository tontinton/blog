// Karst lab: limestone towers at real Khao Sok scale (person = 7 voxels, long-tail boat ~16 long).
//   ?scene=karst_test[&which=tower|slim|dome|massif|islets|cave|all][&seed=n]
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD } = V;
const q = new URLSearchParams(location.search);
const which = q.get('which') ?? 'tower', seed = Number(q.get('seed') ?? 1);
const stage = new Stage({ look: q.get('look') ?? 'golden', camera: { yaw: 40, pitch: 28 } });
const P = new Palette({ ...NATURE, ...BUILD, ...V.JUNGLE, ...V.UNDERSTORY, ...V.KARST, ...V.THAI,
  water: { color: '#2f8f7a', kind: 'water', opacity: 0.45 }, lakeBed: { color: '#3d5a40', jitter: 0.05 } });
const g = new VoxelGrid(P);
const JL = ['jungleLeafDark', 'jungleLeaf', 'jungleLeafLight', 'jungleLeafSun'];
const S = which === 'all' || which === 'massif' ? 70 : 48, BED = -6;
g.box([-S, BED - 1, -S], [S, BED, S], 'lakeBed');
g.box([-S, BED + 1, -S], [S, 0, S], 'water');
const bare = q.has('bare') ? { cap: false, vines: 0, shrubs: 0, trees: 0 } : {};
const k = (p, o) => V.karst(g, p, { water: 0, leaves: JL, trunk: 'barkPale', seed, ...o, ...bare });
const t0 = performance.now();
let a;
if (which === 'tower') a = k([0, BED, -4], { height: 90, radius: 20 });
if (which === 'slim') a = k([0, BED, -4], { height: 100, radius: 11, lean: 0.12 });
if (which === 'dome') a = k([0, BED, -4], { height: 60, radius: 18, profile: 'dome' });
if (which === 'massif') a = k([-6, BED, -10], { height: 95, radius: [34, 22], peaks: 3 });
if (which === 'islets') { for (const [i, p] of [[-14, -10], [8, -16], [-2, 10], [16, 6]].entries()) a = V.karstIslet(g, [p[0], BED, p[1]], { water: 0, leaves: JL, seed: seed + i, height: [16, 9, 6, 12][i] }); }
if (which === 'cave') { a = k([0, BED, -8], { height: 60, radius: 16 }); console.log('cave', JSON.stringify(V.cave(g, a.faces['+z'], { dir: '+z', width: 10, height: 12, depth: 16, glow: true, water: 'water', vines: true, leaves: JL, seed }))); }
if (which === 'waterfall') a = k([0, BED, -4], { height: 70, radius: 16, waterfall: '+z' });
if (which === 'all') {
  a = k([-30, BED, -30], { height: 95, radius: 18 });
  k([22, BED, -34], { height: 60, radius: 14, profile: 'dome', seed: seed + 1 });
  k([-40, BED, 20], { height: 75, radius: [24, 16], peaks: 2, seed: seed + 2 });
  k([30, BED, 22], { height: 105, radius: 10, lean: 0.1, seed: seed + 3 });
  V.karstIslet(g, [4, BED, 30], { water: 0, leaves: JL, seed: 9 });
}
if (a?.waterfall) V.waterfall(g, a.waterfall.top, a.waterfall.bottomY, { axis: a.waterfall.axis, width: a.waterfall.width });
console.log('karst', which, 'ms', Math.round(performance.now() - t0), JSON.stringify({ ...a, ledges: a?.ledges?.length }));
// scale: a long-tail boat-size box with a person at the foot of the tower (front, +x/+z side)
const bx = 14, bz = 26;
g.box([bx, 0, bz], [bx + 15, 1, bz + 3], 'longtailHull');
g.box([bx + 1, 1, bz + 1], [bx + 14, 1, bz + 2], 0);
V.person(g, [bx + 6, 1, bz + 1], { side: '+x', seed: 4 });
stage.add(g, { bake: { ao: true, light: true } });
stage.particles({ preset: 'dust', count: 60 });
stage.start();
