// Thai jungle-lake structures (lib/gen/thai.js) at real scale next to people and water.
//   ?scene=thai_test                 the whole test lake
//   ?scene=thai_test&item=spiritHouse   one registered example on its own (with a person for scale)
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD } = V;
const q = new URLSearchParams(location.search);
const item = q.get('item');
const stage = new Stage({ look: q.get('look') ?? 'golden', camera: { yaw: 38, pitch: 32 } });
const P = new Palette({ ...NATURE, ...BUILD, ...V.JUNGLE, ...V.UNDERSTORY, ...V.KARST, ...V.THAI,
  water: { color: '#3aa89a', kind: 'water', opacity: 0.45 }, lakeBed: { color: '#5a6a48', jitter: 0.06 } });
const g = new VoxelGrid(P);

if (q.has('dirs')) {
  // every generator in all four orientations (checks the local frame: no mirroring, anchors on the right side)
  g.box([-40, -4, -40], [40, -4, 40], 'lakeBed'); g.box([-40, -3, -40], [40, 0, 40], 'water');
  ['+x', '+z', '-x', '-z'].forEach((d, i) => {
    const ox = -27 + i * 18;
    const r = V.raftHouse(g, [ox, 0, -24], { side: d, seed: i + 1 });
    V.person(g, r.door, { side: d, seed: 1 });
    V.longtail(g, r.mooring, { dir: r.mooringDir, seed: i, passengers: 1 });
    V.longtail(g, [ox, 0, 6], { dir: d, seed: i + 5 });
    V.kayak(g, [ox, 0, 16], { dir: d, seed: i });
    V.spiritHouse(g, [ox - 4, 1, 28], { side: d });
    g.box([ox + 2, -3, 25], [ox + 9, 0, 33], 'grass');
    V.parkSign(g, [ox + 5, 1, 29], { side: d, text: 'HI' });
  });
} else if (item) {
  const e = V.lookup('generator', item);
  if (!e) throw new Error(`no generator ${item}`);
  if (e.ground !== false) V.tile(g, [-12, -12], [12, 12], { depth: 2, seed: 1 });
  e.example(g);
  if (q.has('person')) V.person(g, q.get('person').split(',').map(Number), { seed: 7, side: '+z' });
} else {
  // lake (water top at y = 0) with a shore at -x/-z rising into jungle
  const W = 56;
  g.box([-W, -5, -W], [W, -5, W], 'lakeBed');
  g.box([-W, -4, -W], [W, 0, W], 'water');
  // shore: grass bank along the back (-z) and left (-x)
  g.fill([-W, -4, -W], [W, 3, W], (x, y, z) => {
    const d = Math.min(x + W, z + W);              // distance from the back-left edges
    const top = 3 - Math.floor(d / 4);
    return y <= top && d < 22 ? (y === top ? 'grass' : 'dirt') : 0;
  });
  // raft houses in a row along a walkway, boats moored
  const rafts = [];
  for (let i = 0; i < 3; i++) rafts.push(V.raftHouse(g, [-14 + i * 14, 0, 4], { seed: 10 + i, roof: i === 1 ? 'tin' : 'thatch', hammock: i !== 1 }));
  V.walkway(g, [[-24, -6], [22, -6]], { y: 1, seed: 2 });
  for (const r of rafts) V.walkway(g, [[r.door[0] + 1, -5], [r.door[0] + 1, r.corners[0][1]]], { y: 1, width: 3 });
  const m = rafts[2].mooring;
  V.longtail(g, m, { dir: rafts[2].mooringDir, passengers: 0, driver: false, seed: 4 });
  V.longtail(g, [6, 0, 28], { dir: '+x', passengers: 3, canopy: true, seed: 6 });
  V.longtail(g, [-26, 0, 24], { dir: '-z', passengers: 1, seed: 8 });
  V.kayak(g, [24, 0, 18], { seed: 2, dir: '-x' });
  V.kayak(g, [30, 0, 8], { seed: 5, seats: 2, dir: '+z' });
  // people on the porches
  V.person(g, rafts[0].bench, { pose: 'sit', side: rafts[0].benchSide, seed: 3 });
  V.person(g, rafts[1].porch, { side: '+z', pose: 'wave', seed: 5 });
  // shore: spirit house, sala on a jetty, park sign, tree houses with a rope bridge
  V.spiritHouse(g, [-36, 4, -14], { side: '+z', seed: 3 });
  V.person(g, [-33, 4, -10], { side: '-x', seed: 9 });
  V.jetty(g, [30, 1, -40], [30, 1, -16], { width: 5 });
  V.sala(g, [30, 2, -10], { stilts: 2, w: 7, d: 7, side: '+z' });
  V.parkSign(g, [-44, 4, 6], { side: '+x' });
  const a = V.treeHouse(g, [-40, 4, -38], { height: 16, tree: true, seed: 1, bridges: ['+x'] });
  const b = V.treeHouse(g, [-6, 4, -44], { height: 20, tree: true, trunkR: 3, seed: 2, bridges: ['-x'], stair: 'ladder' });
  V.ropeBridge(g, a.bridgeAnchors[0], b.bridgeAnchors[0], { sag: 4 });
}
stage.add(g, { bake: { ao: true, light: true } });
stage.start();
