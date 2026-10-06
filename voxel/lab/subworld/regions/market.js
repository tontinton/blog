// Market (middle region): the town square at golden hour. A warm flagstone plaza around a two-tier fountain,
// the cobbled road running straight through it, striped market stalls (fruit, fish, flowers, bread, veg, cloth)
// with vendors, timber/plaster town houses and a bell-towered town hall on the north side, a garden with a well
// and two cottages on the south side, lampposts, trees, and people, cats, a dog and gulls.
import { tile, house, lamppost, crate, barrel, bench, person, well, bush, flower } from '../../../lib/index.js';
import { ROAD, Z0, Z1, LIFE } from '../layout.js';

const SIDES = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

export default function build(g, ctx) {
  const { x0, x1 } = ctx.options, R = ctx.rng, P = ctx.P;
  const M = (name, def) => P.add(`market_${name}`, def);
  const paving = M('paving', { colors: ['#cdb795', '#bfa886', '#d6c3a2'], jitter: 0.05, grid: 0.35 });
  const pavingLight = M('pavingLight', { colors: ['#e2d3b6', '#d8c7a7'], jitter: 0.04, grid: 0.3 });
  const curb = M('curb', { color: '#8d8579', jitter: 0.06, grid: 0.4 });
  const fstone = M('fountainStone', { color: '#d9d1c2', jitter: 0.05 });
  const spray = M('spray', { color: '#cdeef6', kind: 'water', opacity: 0.55 });
  const orange = M('orange', { color: '#ec8a2a', jitter: 0.08 });
  const lemon = M('lemon', { color: '#f1d44a', jitter: 0.07 });
  const grape = M('grape', { color: '#6e3a82', jitter: 0.08 });
  const cabbage = M('cabbage', { color: '#93c463', jitter: 0.08 });
  const carrot = M('carrot', { color: '#e3712a', jitter: 0.06 });
  const pumpkin = M('pumpkin', { color: '#dd7a22', jitter: 0.06 });
  const fish = M('fish', { colors: ['#a9bccb', '#8fa6b8'], metalness: 0.4, roughness: 0.4, jitter: 0.05 });
  const ice = M('ice', { color: '#e3f3f7', roughness: 0.3, jitter: 0.03 });
  const bread = M('bread', { colors: ['#c98d48', '#b97a38'], jitter: 0.05 });
  const clay = M('clay', { color: '#b8623c', jitter: 0.06 });
  const basket = M('basket', { color: '#b98a4e', jitter: 0.08 });
  const clothPurple = M('clothPurple', { color: '#8a5ab0', jitter: 0.03, roughness: 1 });
  const clothGreen = M('clothGreen', { color: '#5f9a62', jitter: 0.03, roughness: 1 });
  const awningGreen = M('awningGreen', { color: '#5c9a5e', jitter: 0.04 });
  const awningYellow = M('awningYellow', { color: '#e8b347', jitter: 0.04 });
  const walls = {
    peach: M('plasterPeach', { color: '#ebc4a2', jitter: 0.03 }),
    yellow: M('plasterYellow', { color: '#ecd394', jitter: 0.03 }),
    blue: M('plasterBlue', { color: '#bcd0dc', jitter: 0.03 }),
    pink: M('plasterPink', { color: '#e7b9b2', jitter: 0.03 }),
    cream: P.id('plaster'),
  };
  const shutters = [M('shutterGreen', { color: '#4f7d5a', jitter: 0.04 }), M('shutterBlue', { color: '#3e6e98', jitter: 0.04 })];
  const put = (x, y, z, m) => g.put(x, y, z, m);
  const dist = (x, z) => Math.hypot(x + 0.5, z + 0.5);           // from the plaza centre (the corner between 4 voxels at 0,0)
  const ring = (r0, r1, y0, y1, m) => {
    const n = Math.ceil(r1) + 1;
    for (let x = -n; x < n; x++) for (let z = -n; z < n; z++) { const d = dist(x, z); if (d > r0 && d <= r1) g.box([x, y0, z], [x, y1, z], m); }
  };

  // ---- ground: grass slab (same depth/seed as the neighbours), plaza, road ---------------------------------
  tile(g, [x0, Z0], [x1, Z1], { depth: 6, seed: 3 });
  const PX0 = -25, PX1 = 24, PZ0 = -20, PZ1 = 17;
  g.box([PX0, 0, PZ0], [PX1, 0, PZ1], paving);
  for (let x = PX0; x <= PX1; x++) { put(x, 0, PZ0, curb); put(x, 0, PZ1, curb); }
  for (let z = PZ0; z <= PZ1; z++) { put(PX0, 0, z, curb); put(PX1, 0, z, curb); }
  g.box([x0, 0, ROAD.z0], [x1, 0, ROAD.z1], ROAD.m);
  ring(-1, 8.6, 0, 0, pavingLight);
  ring(7.6, 8.6, 0, 0, 'cobble');

  // ---- fountain ------------------------------------------------------------------------------------------
  // three tiers: wide basin, mid bowl on a pedestal, small top bowl with a jet; streams fall between tiers
  ring(4.6, 5.8, 1, 1, 'stoneBrick');
  ring(4.6, 5.8, 2, 2, fstone);
  ring(-1, 4.6, 1, 1, 'water');
  ring(-1, 1.6, 1, 5, fstone);
  ring(-1, 3.2, 6, 6, fstone);
  ring(2.4, 3.2, 7, 7, fstone);
  ring(-1, 2.4, 7, 7, 'water');
  ring(-1, 0.8, 7, 9, fstone);
  ring(-1, 1.6, 10, 10, fstone);
  ring(-1, 0.8, 11, 13, spray);
  for (const [x, z] of [[3, -1], [0, 3], [-4, 0], [-1, -4]]) g.box([x, 2, z], [x, 6, z], spray);
  for (const [x, z] of [[1, 1], [-2, 1], [-2, -2], [1, -2]]) g.box([x, 8, z], [x, 9, z], spray);
  ctx.emit('particles', { preset: 'mist', count: 30, opacity: 0.3, box: [[-5, 1, -5], [5, 8, 5]] });

  // ---- market stalls ---------------------------------------------------------------------------------------
  // front-centre cell (fx, fz) of the counter, facing `side`; u across (0..w-1), v depth (0 = counter .. d-1)
  function stall(cx, cz, side, o) {
    const [fx, fz] = SIDES[side], ax = fz !== 0 ? 1 : 0, az = fx !== 0 ? 1 : 0;
    const w = o.w ?? 7, d = o.d ?? 4, h = (w - 1) >> 1;
    const W = (u, v) => [cx + ax * (u - h) - fx * v, cz + az * (u - h) - fz * v];
    const at = (u, y, v, m) => { const [x, z] = W(u, v); put(x, y, z, m); };
    // counter + stock shelf at the back
    for (let u = 0; u < w; u++) { at(u, 1, 0, 'plankDark'); at(u, 2, 0, 'plankDark'); at(u, 3, 0, 'plankLight'); }
    for (let u = 1; u < w - 1; u++) { at(u, 1, d - 1, 'plank'); at(u, 2, d - 1, 'plank'); }
    // posts
    for (const u of [0, w - 1]) for (const v of [0, d - 1]) for (let y = 1; y <= (v === 0 ? 7 : 8); y++) at(u, y, v, 'beam');
    // striped awning: front half lower, 1-voxel overhang in front, valance hanging at the front edge
    const [A, B] = o.awning;
    for (let u = 0; u < w; u++) {
      const m = u % 2 ? B : A;
      for (let v = -1; v < d; v++) at(u, v >= (d >> 1) ? 9 : 8, v, m);
      at(u, 7, -1, m);
      if (u % 2 === 0) at(u, 6, -1, m);
    }
    // vendor behind the counter
    const [px, pz] = W(h, 1), [qx, qz] = W(h - 1, 1);             // person() is 2 wide: start at the lower cell
    person(g, [Math.min(px, qx), 1, Math.min(pz, qz)], { side, seed: R.int(0, 1e6) });
    // goods on the counter + display crates in front
    const top = (u, y, m) => at(u, y, 0, m);
    o.goods({ top, at, W, w, d, R });
  }

  const openCrate = (x, z, m, mound) => {
    g.box([x, 1, z], [x + 1, 1, z + 1], 'plank');
    g.box([x, 2, z], [x + 1, 2, z + 1], m);
    if (mound) put(x + (mound & 1), 3, z + (mound >> 1 & 1), m);
  };
  // min corner of the 2×2 footprint covering local u..u+1, v..v-1 (in front of the counter), for either facing
  const spot = (W, u, v) => { const a = W(u, v), b = W(u + 1, v - 1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1])]; };
  const goods = {
    fruit: ({ top, W, w }) => {
      const fr = [ctx.P.id('apple'), orange, lemon];
      for (let u = 1; u < w - 1; u++) { const m = fr[Math.floor((u - 1) / 2) % 3]; top(u, 4, m); if (u % 2) top(u, 5, m); }
      [[0, 'apple'], [2, grape], [4, orange]].forEach(([u, m], i) => { const [x, z] = spot(W, u, -2); openCrate(x, z, m, i + 1); });
    },
    fish: ({ top, W, w }) => {
      for (let u = 1; u < w - 1; u++) { top(u, 4, ice); if (u % 2) top(u, 5, fish); }
      for (const u of [0, 4]) { const [x, z] = W(u + 1, -3); barrel(g, [x, 1, z], { height: 3 }); put(x, 4, z, fish); }
    },
    flowers: ({ top, W, w }) => {
      const pet = ['petalRed', 'petalYellow', 'petalPink', 'petalPurple', 'petalWhite'];
      for (let u = 1; u < w - 1; u++) { top(u, 4, clay); top(u, 5, pet[u % pet.length]); }
      for (let u = -1; u <= w; u += 2) { const [x, z] = W(u, -2); put(x, 1, z, clay); put(x, 2, z, 'stem'); put(x, 3, z, pet[(u + 7) % pet.length]); }
    },
    bread: ({ top, W, w }) => {
      for (let u = 1; u < w - 1; u++) { top(u, 4, u % 3 === 0 ? basket : bread); }
      for (const u of [1, 4]) { const [x, z] = spot(W, u, -2); g.box([x, 1, z], [x + 1, 1, z + 1], basket); g.box([x, 2, z], [x + 1, 2, z + 1], bread); }
    },
    veg: ({ top, W, w }) => {
      for (let u = 1; u < w - 1; u++) { top(u, 4, u % 2 ? cabbage : carrot); }
      for (const u of [0, 3]) { const [x, z] = spot(W, u, -2); g.box([x, 1, z], [x + 1, 2, z + 1], pumpkin); put(x, 3, z, 'stem'); }
      const [x, z] = spot(W, 5, -2); openCrate(x, z, cabbage, 2);
    },
    cloth: ({ top, W, w }) => {
      const cl = ['fabric', 'fabricRed', clothPurple, clothGreen, 'awningCream'];
      for (let u = 1; u < w - 1; u++) { top(u, 4, cl[u % cl.length]); if (u % 2) top(u, 5, cl[(u + 2) % cl.length]); }
      for (const u of [1, 4]) { const [x, z] = spot(W, u, -2); crate(g, [x, 1, z]); }
    },
  };

  // north row faces the fountain (+z); south pair faces it from the other side (-z)
  stall(-20, -14, '+z', { awning: ['awningRed', 'awningCream'], goods: goods.fruit });
  stall(-11, -14, '+z', { awning: ['awningBlue', 'awningCream'], goods: goods.fish });
  stall(10, -14, '+z', { awning: [awningGreen, 'awningCream'], goods: goods.flowers });
  stall(19, -14, '+z', { awning: [awningYellow, 'awningCream'], goods: goods.bread });
  stall(-19, 6, '-z', { awning: ['awningRed', 'awningCream'], goods: goods.veg });
  stall(18, 6, '-z', { awning: ['awningBlue', 'awningCream'], goods: goods.cloth });

  // ---- houses -----------------------------------------------------------------------------------------------
  function townhouse(x, z, w, d, o) {
    const floors = o.floors ?? 2, h = o.h ?? (floors === 2 ? 12 : 7);
    const side = o.side ?? '+z', [fx, fz] = SIDES[side];
    const along = side.endsWith('z') ? w : d;
    const doorAt = o.doorAt ?? Math.floor((along - 2) / 2);
    const lit = () => (R.chance(o.lit ?? 0.45) ? 'windowLit' : 'window');
    const wins = [];
    const n = Math.max(1, Math.floor((along - 2) / 4));
    const slots = [];
    for (let i = 0; i < n + 1; i++) slots.push(Math.round(((i + 1) * along) / (n + 2)) - 1);
    for (const at of slots) {
      if (Math.abs(at - doorAt) >= 3) wins.push({ side, at, y: 2, w: 2, h: 3, fill: lit() });
      if (floors === 2) wins.push({ side, at, y: 7, w: 2, h: 3, fill: lit() });
    }
    // a window or two on the other sides
    const back = { '+z': '-z', '-z': '+z', '+x': '-x', '-x': '+x' }[side];
    wins.push({ side: back, y: floors === 2 ? 7 : 2, w: 2, h: 3, fill: lit() });
    for (const s of side.endsWith('z') ? ['+x', '-x'] : ['+z', '-z']) wins.push({ side: s, y: 2, w: 2, h: 3, fill: lit() });
    const res = house(g, [x, 1, z], { w, d, h, wall: o.wall, roof: o.roof, axis: o.axis, door: { side, w: 2, h: 5, at: doorAt }, windows: wins, chimney: o.chimney, seed: R.int(0, 1e6) });
    if (floors === 2) g.box([x, 7, z], [x + w - 1, 7, z + d - 1], 'beam', { mode: 'paint' });
    // shutters + flower boxes on the front windows
    const sh = o.shutter ?? R.pick(shutters);
    const fixed = fz > 0 ? z + d - 1 + 1 : fz < 0 ? z - 1 : fx > 0 ? x + w : x - 1;
    const cellAt = (a) => (side.endsWith('z') ? [x + a, fixed] : [fixed, z + a]);
    for (const wd of wins) {
      if (wd.side !== side) continue;
      for (let y = 1 + wd.y; y < 1 + wd.y + wd.h; y++) for (const a of [wd.at - 1, wd.at + wd.w]) { const [cx, cz] = cellAt(a); put(cx, y, cz, sh); }
      for (let a = wd.at; a < wd.at + wd.w; a++) { const [cx, cz] = cellAt(a); put(cx, wd.y, cz, R.chance(0.5) ? 'petalRed' : 'leaf'); }
    }
    return res;
  }

  // north side (doors onto the plaza)
  const hA = townhouse(-31, -30, 9, 9, { wall: walls.peach, roof: 'roofTile', chimney: true });
  townhouse(-20, -29, 8, 8, { wall: walls.blue, roof: 'roofSlate', axis: 'z' });
  townhouse(12, -29, 8, 8, { wall: walls.yellow, roof: 'roofTile', axis: 'z' });
  const hD = townhouse(21, -30, 10, 9, { wall: walls.pink, roof: 'roofSlate', chimney: true });
  // town hall with a bell tower
  {
    const x = -10, z = -31, w = 20, d = 11, h = 13;
    const wins = [];
    for (const at of [2, 6, 12, 16]) wins.push({ side: '+z', at, y: 2, w: 2, h: 4, fill: R.chance(0.5) ? 'windowLit' : 'window' });
    for (const at of [2, 6, 9, 12, 16]) wins.push({ side: '+z', at, y: 8, w: 2, h: 3, fill: R.chance(0.5) ? 'windowLit' : 'window' });
    for (const s of ['+x', '-x']) wins.push({ side: s, y: 8, w: 2, h: 3, fill: 'windowLit' });
    for (const at of [3, 9, 15]) wins.push({ side: '-z', at, y: 8, w: 2, h: 3, fill: R.chance(0.4) ? 'windowLit' : 'window' });
    house(g, [x, 1, z], { w, d, h, wall: walls.cream, roof: 'roofTileDark', door: { side: '+z', w: 4, h: 6 }, windows: wins, base: 'stoneBrick' });
    g.box([x, 7, z], [x + w - 1, 7, z + d - 1], 'beam', { mode: 'paint' });
    g.box([x, 1, z], [x + w - 1, 1, z + d - 1], 'stoneBrick', { mode: 'paint' });
    g.box([-4, 1, z + d], [3, 1, z + d], 'stoneBrick');                // front step
    // tower
    // tower (rises out of the roof ridge, which tops out at y = 20)
    const tx0 = -2, tx1 = 1, tz0 = -28, tz1 = -25, ty0 = 14, ty1 = 30;
    g.box([tx0, ty0, tz0], [tx1, ty1, tz1], walls.cream, { walls: true });
    for (const [a, b] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]]) g.box([a, ty0, b], [a, ty1, b], 'beam');
    for (const y of [21, 25, ty1]) g.box([tx0, y, tz0], [tx1, y, tz1], 'beam', { walls: true });
    g.box([tx0 + 1, 22, tz1], [tx1 - 1, 23, tz1], 'paper');                                        // clock face
    put(tx0 + 1, 23, tz1, 'plankDark'); put(tx1 - 1, 22, tz1, 'plankDark');
    g.box([tx0 + 1, 26, tz0], [tx1 - 1, 28, tz1], 0); g.box([tx0, 26, tz0 + 1], [tx1, 28, tz1 - 1], 0);   // belfry openings
    g.box([tx0 + 1, 26, tz0 + 1], [tx1 - 1, 27, tz1 - 1], 'gold');                                 // bell
    g.box([tx0 + 1, 28, tz0 + 1], [tx1 - 1, 28, tz1 - 1], 'beam');
    g.roof([tx0, ty1 + 1, tz0], [tx1, ty1 + 1, tz1], 'roofSlate', { type: 'hip', overhang: 1 });
    g.box([-1, ty1 + 5, -27], [0, ty1 + 6, -26], 'gold');
  }
  // south side: two cottages at the corners (low, so the plaza stays visible) and a garden with a well
  townhouse(-30, 21, 10, 8, { floors: 1, side: '-z', wall: walls.yellow, roof: 'thatch', chimney: true });
  townhouse(20, 21, 10, 8, { floors: 1, side: '-z', wall: walls.cream, roof: 'roofTile' });
  well(g, [0, 1, 25], { radius: 2.2 });
  g.box([-1, 0, PZ1 + 1], [0, 0, 22], 'dirt');
  for (let i = 0; i < 18; i++) {
    const x = R.int(-17, 16), z = R.int(19, 30);
    if (Math.abs(x) < 4 && z < 29) continue;
    flower(g, [x, 1, z], { seed: R.int(0, 1e6) });
  }
  for (const [x, z] of [[-14, 26], [13, 26], [-8, 28], [8, 28]]) bush(g, [x, 1, z], { radius: 2, seed: R.int(0, 1e6) });

  // ---- trees, lamps, benches, odds and ends ------------------------------------------------------------------
  ctx.instance('oak', [-27, 1, -12], 30, 0.9);
  ctx.instance('oak', [27, 1, -16], 200, 0.85);
  ctx.instance('oak', [-27, 1, 13], 120, 0.8);
  ctx.instance('appleTree', [27, 1, 12], 0, 1);
  // lamps flank the road where it enters the square, and light the aisles between the stalls and the fountain
  for (const [x, z] of [[-23, -5], [22, -5], [-23, 4], [22, 4], [-10, -8], [9, -8], [-31, 4], [30, -5]]) lamppost(g, [x, 1, z], { height: 7 });
  for (const [x, z, s] of [[-12, 15, '-z'], [9, 15, '-z']]) bench(g, [x, 1, z], s, { length: 4 });
  person(g, [-11, 1, 15], { pose: 'sit', side: '-z', shirt: 'awningBlue', pants: 'plankDark', seed: 7 });
  person(g, [3, 1, -9], { pose: 'wave', side: '-z', seed: 11 });
  ctx.instance('crates', [-15, 1, -24], 90, 1);
  ctx.instance('crates', [9, 1, -23], 0, 1);
  for (const [x, z] of [[-23, -18], [-22, -19], [22, -18]]) barrel(g, [x, 1, z]);
  crate(g, [-26, 1, 8]); crate(g, [-26, 1, 10]); crate(g, [-26, 3, 9]);
  // hay cart parked south of the fountain (bed along x, wheels on both sides, shafts to the west)
  {
    const cx = 3, cz = 11;
    g.box([cx, 2, cz], [cx + 5, 2, cz + 2], 'plank');
    g.box([cx, 3, cz], [cx + 5, 3, cz + 2], 'plankDark', { walls: true });
    g.box([cx + 1, 3, cz + 1], [cx + 4, 4, cz + 1], 'hay'); g.box([cx + 2, 5, cz + 1], [cx + 3, 5, cz + 1], 'hay');
    for (const z of [cz - 1, cz + 3]) { g.cylinder([cx + 3, 1, z], 1.2, 1, 'plankDark', { axis: 'z' }); put(cx + 3, 2, z, 'metalDark'); }
    for (const z of [cz, cz + 2]) g.line([cx - 1, 2, z], [cx - 4, 1, z], 'plankDark');
    put(cx + 6, 1, cz + 1, 'hay'); put(cx + 6, 1, cz + 2, 'hay');
  }
  // flower pots along the south curb
  for (const x of [-22, -16, -6, 5, 15, 21]) { put(x, 1, PZ1 - 1, clay); put(x, 2, PZ1 - 1, R.pick(['petalRed', 'petalYellow', 'petalPink', 'leaf'])); }
  // bunting strung between the two aisle lamps north of the fountain: a sagging line with pennants
  // (swaying materials: they flutter, and actors walk under swaying voxels instead of treating them as a wall)
  {
    const a = [-10, 12, -8], b = [9, 12, -8];
    const rope = M('rope', { color: '#e8dcc0', sway: 0.25 });
    const cols = ['awningRed', awningYellow, 'awningBlue', awningGreen, 'awningCream'].map((m, i) => P.variant(m, { sway: 0.6, emissive: 0.15 }, `market_flag${i}`));
    for (const [x, , z] of [a, b]) g.box([x, 10, z], [x, 12, z], 'metalDark');
    for (let x = a[0] + 1; x < b[0]; x++) {
      const t = (x - a[0]) / (b[0] - a[0]), y = Math.round(a[1] - 2.2 * (1 - (2 * t - 1) ** 2));
      const m = cols[((x - a[0]) >> 1) % cols.length];
      put(x, y, a[2], rope);
      put(x, y - 1, a[2], m);
      if ((x - a[0]) % 2 === 1) put(x, y - 2, a[2], m);
    }
  }

  // ---- life ----------------------------------------------------------------------------------------------------
  ctx.emit('particles', { preset: 'smoke', count: 30, box: [[hA.chimneyTop[0] - 1, hA.chimneyTop[1], hA.chimneyTop[2] - 1], [hA.chimneyTop[0] + 2, hA.chimneyTop[1] + 12, hA.chimneyTop[2] + 2]] });
  ctx.emit('particles', { preset: 'smoke', count: 30, box: [[hD.chimneyTop[0] - 1, hD.chimneyTop[1], hD.chimneyTop[2] - 1], [hD.chimneyTop[0] + 2, hD.chimneyTop[1] + 12, hD.chimneyTop[2] + 2]] });
  ctx.emit('actors', { ...LIFE.walker, count: 9, area: [[PX0 + 1, PZ0 + 1], [PX1 - 1, PZ1 - 1]] });
  ctx.emit('actors', { ...LIFE.walker, count: 3, area: [[x0, ROAD.z0], [x1, ROAD.z1]] });
  ctx.emit('actors', { ...LIFE.cat, count: 2, area: [[PX0 + 1, PZ0 + 1], [PX1 - 1, PZ1 - 1]] });
  ctx.emit('actors', { ...LIFE.dog, count: 1, area: [[PX0 + 1, PZ0 + 1], [PX1 - 1, PZ1 - 1]] });
  ctx.emit('actors', { ...LIFE.gulls, count: 5, center: [0, 34, 0], radius: 20 });
}
