// Understory generators at real scale next to people (unpublished lab scene).
//   ?scene=understory_test                    showcase diorama (golden morning)
//   ?scene=understory_test&show=rafflesia     one registered example + a person for scale (target 0,y,0)
//   &look=daylight
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD } = V;
const q = new URLSearchParams(location.search);
const show = q.get('show');
const stage = new Stage({ look: q.get('look') ?? 'golden', camera: { yaw: 38, pitch: 30 } });
const P = new Palette({ ...NATURE, ...BUILD, ...V.JUNGLE, ...V.UNDERSTORY, ...V.KARST, ...V.THAI,
  water: { color: '#3a9a8a', kind: 'water', opacity: 0.45 },
  forestFloor: { color: '#4a5a2a', jitter: 0.06, noise: { color: '#5a4a2a', scale: 0.2, amount: 0.7 } },
  forestFloorDark: { color: '#3a3a22', jitter: 0.06 } });
const g = new VoxelGrid(P);

if (q.get('gen')) { // ?gen=alocasia&o={"count":1}  one call at the origin, 4 seeds in a row
  V.tile(g, [-14, -14], [14, 14], { depth: 3, top: 'forestFloor', layers: [['dirt', 99]] });
  const o = JSON.parse(q.get('o') || '{}'), n = Number(q.get('n') ?? 1);
  for (let i = 0; i < n; i++) V[q.get('gen')](g, [n > 1 ? -9 + i * 6 : 0, 1, 0], { seed: i + 1, ...o });
  V.person(g, [10, 1, -6], { side: '-x', seed: 2 });
} else if (show) {
  const e = V.lookup('generator', show);
  if (e.ground !== false) V.tile(g, [-14, -14], [14, 14], { depth: 3, top: 'forestFloor', layers: [['dirt', 99]] });
  e.example(g);
  V.person(g, [10, 1, -6], { side: '-x', seed: 2 });
} else {
  const S = 34;
  V.tile(g, [-S, -S], [S, S], { depth: 4, top: 'forestFloor', layers: [['dirt', 2], ['dirtDark', 99]] });
  // pond (front right)
  V.pond(g, [18, 18], { radius: 11, depth: 3, shore: 'forestFloorDark', bed: 'dirtDark' });
  V.lilyPads(g, [5, 5], [31, 31], { seed: 4, coverage: 0.3 });
  // a big tree with branches (back left) carrying epiphytes + lianas, rattan climbing it
  const T = [-20, 1, -20];
  g.cylinder(T, 3, 44, 'barkPale', { r2: 2 });
  const tips = [];
  for (const [dx, y, dz] of [[16, 30, 2], [3, 34, 16], [14, 38, 14], [-6, 32, 14], [18, 26, -6]]) {
    const tip = [T[0] + dx, y + 3, T[2] + dz];
    g.line([T[0], y, T[2]], tip, 'barkPale', { r: 1.3, r2: 0.7 });
    V.foliage(g, [{ c: [tip[0], tip[1] + 3, tip[2]], r: 4 }], { leaves: ['jungleLeafDark', 'jungleLeaf', 'jungleLeafLight'], seed: dx + y });
    tips.push([tip[0] - Math.sign(dx) * 2, tip[1] - 1, tip[2] - Math.sign(dz) * 2]);
  }
  V.foliage(g, [{ c: [T[0], 48, T[2]], r: 8 }], { leaves: ['jungleLeafDark', 'jungleLeaf', 'jungleLeafLight', 'jungleLeafSun'], seed: 2 });
  V.epiphytes(g, { area: [[-34, 8, -34], [0, 44, 0]], on: ['barkPale'], density: 0.18, seed: 3 });
  V.lianas(g, tips, { seed: 5 });
  V.rattan(g, [-13, 1, -12], { seed: 3, to: [-17, 22, -18], stems: 2 });
  // hero: rafflesia front-centre with a person
  V.rafflesia(g, [0, 1, 12], { seed: 3, buds: 3 });
  V.person(g, [6, 1, 17], { side: '-x', seed: 4, pose: 'wave' });
  V.person(g, [-9, 1, 22], { side: '+z', seed: 7 });
  // log, plants
  V.fallenLog(g, [-28, 1, 8], [-10, 1, 16], { seed: 2, radius: 2.4, ferns: 1 });
  V.treeFern(g, [-6, 1, -2], { seed: 4, height: 9 });
  V.treeFern(g, [10, 1, -14], { seed: 6, height: 7 });
  V.alocasia(g, [-14, 1, 26], { seed: 5, count: 5, height: 5.5 });
  V.alocasia(g, [12, 1, 2], { seed: 8, count: 4 });
  V.heliconia(g, [-24, 1, 26], { seed: 3, height: 6 });
  V.heliconia(g, [24, 1, -2], { seed: 4, form: 'hanging', height: 6 });
  V.pitcherPlant(g, [-4, 1, 28], { seed: 3, big: 1 });
  V.fern(g, [4, 1, 2], { seed: 2, radius: 3.6 });
  V.undergrowth(g, [-S, -S], [S, S], { seed: 2, on: ['forestFloor'], avoid: [[[-6, 5], [8, 20]], [[3, 3], [33, 33]], [[-30, 5], [-8, 19]]] });
}
stage.add(g, { bake: { ao: true, light: true } });
stage.start();
