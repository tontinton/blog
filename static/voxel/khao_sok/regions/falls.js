// falls (NW, x −120…−41, z −120…−41) — the back corner and the tallest landmark of Khao Sok: the 'massif', two sheer
// jungle-capped limestone towers (114 and ~96 high), a spring gushing from a slot in the tall one's front face and
// falling in three cascades over rock shelves into the plunge pool (a faint rainbow in the spray), soft cloud
// streamers around the towers' waist, the pool's mossy boulders, tree ferns, a strangler fig and the rainforest
// around the foot. Life: hornbills circling the summit, langurs beside the upper fall, a serow above the spring, a
// kingfisher hopping between stepping stones, a water monitor sunning, a macaque on a fallen-log bridge, dragonflies,
// birdwings, butterflies, fish.
import {
  karst, rock, foliage, fern, treeFern, alocasia, heliconia, pitcherPlant, rainforest, undergrowth, epiphytes,
  lianas, strangler, jungleTree, fallenLog, bamboo, hash3, noise, clamp,
} from '../../lib/index.js';
import { ground } from '../base.js';
import { KARSTS, POOL, POOL_Y, LIFE, CAMERA, columnAt } from '../layout.js';

const LEAVES = ['jungleLeafDark', 'jungleLeaf', 'jungleLeafLight', 'jungleLeafSun'];
const GROUND = ['floor', 'floorLitter', 'floorMoss', 'bank'];
const ROCK = ['limestone', 'limestoneLight', 'limestoneDark', 'limestoneStreak', 'limestoneOrange', 'limestoneNotch', 'karstMoss'];

export default function build(g, ctx) {
  ground(g, ctx);
  // g.top() / g.bounds() recompute the exact bounds with a full scan after every write (karst() and epiphytes() call
  // them): pin them to the region box while building (top() only needs the y range), restored at the end
  const [[bx0, by0, bz0], [bx1, by1, bz1]] = ctx.box;
  const BOX = { min: [bx0, by0, bz0], max: [bx1, by1, bz1], size: [bx1 - bx0 + 1, by1 - by0 + 1, bz1 - bz0 + 1] };
  g.bounds = () => BOX;
  ctx.clip = true;   // the massif / cloud band brush the back (world) edges on purpose
  const P = ctx.P, R = ctx.rng, N = noise(ctx.seed + 7);
  const M = (n) => g.mat(n);

  // ---- region-local materials ----
  P.add('falls_white', { colors: ['#f4fafb', '#e6f4f6', '#d8eef2'], jitter: 0.03, emissive: 0.4, emissiveColor: '#e8f6f8', roughness: 0.3 });
  P.add('falls_blue', { colors: ['#bfe2ea', '#acd8e2'], jitter: 0.03, emissive: 0.18, emissiveColor: '#cfeef2', roughness: 0.3 });
  P.add('falls_foam', { colors: ['#ffffff', '#f2fafc'], jitter: 0.02, emissive: 0.55, emissiveColor: '#ffffff', roughness: 0.5 });
  P.add('falls_wetRock', { colors: ['#56615c', '#4d5853', '#5e6964'], jitter: 0.05, noise: { color: '#3e4a44', scale: 0.2, amount: 0.7 }, roughness: 0.4 });
  P.add('falls_wetMoss', { colors: ['#3d7a32', '#4a8838', '#33692b'], jitter: 0.06, roughness: 0.6 });
  ['#ff7a6a', '#ffb04e', '#ffe45a', '#86d672', '#64aaff', '#a884ea'].forEach((c, i) => P.add(`falls_rainbow${i}`, { color: c, kind: 'glass', ior: 1, opacity: 0.1, roughness: 0.3 }));
  const GROUND_IDS = new Set(GROUND.map(M));
  const ROCKS = new Set(ROCK.map(M)), isRock = (x, y, z) => ROCKS.has(g.get(x, y, z));
  const wet = M('falls_wetRock'), wetMoss = M('falls_wetMoss'), water = M('riverWater');
  const white = [M('falls_white'), M('falls_white'), M('falls_blue')], foam = M('falls_foam');

  // ---- 1. the massif ----
  const K = KARSTS.find((k) => k.id === 'massif');
  // two sheer towers rising out of the jungle (a single 'massif' karst call is slower and its silhouette is a lumpy
  // mound; two calls give exact control): the tallest right above the falls, the second to the west
  const kopt = { leaves: LEAVES, trunk: 'barkPale', vines: 1, gardens: 0.8 };
  // buttresses widen the feet (the 'nail' taper), the west tower leans away to the back-west and steps down
  const main = karst(g, [-68, 6, -100], { ...kopt, height: K.height, radius: [13, 12], profile: 'tower', seed: K.seed + 1, lean: 0.02, buttresses: 2, grooves: 4, trees: 3, cap: 'sparse' });
  const west = karst(g, [-103, 6, -101], { ...kopt, height: 81, radius: [12, 11], profile: 'tower', seed: K.seed + 2, lean: 0.07, leanAngle: 200, buttresses: 2, trees: 3, cap: 'sparse', peaks: 2, gardens: 0.5 });
  shoulder(78, -114, -94, 7);         // the main tower's right outline steps in at ~2/3 height (a ledge with a shrub)
  summitClumps(main.top, 4); summitClumps(west.top, 3);   // a few leaf clumps, kept inside the rock outline
  skirt(-68, -100, 15, 52, 6, 21);   // flared, stepped feet: tops ≈ 60–70 % of the base width
  skirt(-103, -101, 15, 44, 5, 19);
  // highest solid voxel of a column (g.top() rescans the whole grid's bounds after every write: too slow here)
  const colTop = (x, z, from = 140) => { for (let y = from; y > -14; y--) if (g.get(x, y, z)) return y; return -14; };
  // grid.paint() walks the whole grid; this only touches the chunks overlapping the box
  const paintIn = (a, b, fn) => { const ed = []; g.forEachIn(a, b, (x, y, z, id) => { const r = fn(x, y, z, id); if (r !== undefined && r !== id) ed.push(x, y, z, r); }); for (let i = 0; i < ed.length; i += 4) g.set(ed[i], ed[i + 1], ed[i + 2], ed[i + 3]); };
  const groundTop = (x, z) => { const c = columnAt(x, z); return c.kind === 'land' ? c.top : c.water; };
  const faceZ = (x, y, from = -60) => { for (let z = from; z >= -120; z--) if (isRock(x, y, z)) return z; return -121; };

  // ---- 2. the waterfall: spring cave → fall 1 → shelf A → fall 2 → buttress B → fall 3 → plunge basin ----
  const FX = -61;                          // fall axis (x)
  // clear the karst's own plants out of the fall corridor
  const KEEP = new Set([...ROCKS, ...['floor', 'floorLitter', 'floorMoss', 'bank', 'soil', 'soilDark', 'laterite', 'clayBand', 'bedrock', 'bedrockDark', 'riverBed', 'riverWater'].map(M)]);
  paintIn([FX - 9, 10, -95], [FX + 9, 80, -62], (x, y, z, id) => (KEEP.has(id) ? undefined : 0));
  // the spring: a dark slot in the face from which the water gushes (a shallow alcove: the karst is a 4-voxel shell).
  // The face around the slot is first made flush (recesses filled) so the jet is short and the same for every column.
  const my = 70, caveDark = M('caveDark'), caveRock = M('caveRock');
  const SX = [FX - 2, FX + 2];
  let zM = -120;
  for (let x = SX[0] - 1; x <= SX[1] + 1; x++) for (let y = my; y <= my + 5; y++) zM = Math.max(zM, faceZ(x, y));
  for (let x = SX[0] - 1; x <= SX[1] + 1; x++) for (let y = my - 2; y <= my + 7; y++) for (let z = Math.max(faceZ(x, y) + 1, zM - 9); z <= zM; z++) g.set(x, y, z, M('limestone'));
  const carved = [];
  for (let x = SX[0]; x <= SX[1]; x++) {
    const e = Math.min(x - SX[0], SX[1] - x), h = e === 0 ? 4 : e === 1 ? 5 : 6;
    for (let y = my; y < my + h; y++) for (let z = zM; z > zM - 3; z--) { g.set(x, y, z, 0); carved.push([x, y, z]); }
  }
  for (const [x, y, z] of carved) for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1]]) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    if (isRock(nx, ny, nz)) g.set(nx, ny, nz, dz || hash3(nx, ny, nz, 2) < 0.5 ? caveDark : caveRock);
  }
  for (const [x, y, z] of carved) if (y === my) g.set(x, y, z, z === zM ? white[0] : white[2]);   // pale blue inside, white at the lip
  const mx = FX, mz = zM, lipY = my;
  const yA = 52, yB = 32;
  const F1 = [FX - 2, FX + 2], F2 = [FX, FX + 4], F3 = [FX - 6, FX];
  let z1 = -120;
  for (let x = F1[0]; x <= F1[1]; x++) for (let y = yA + 1; y < lipY - 2; y++) z1 = Math.max(z1, faceZ(x, y));
  z1 = Math.max(z1 + 1, zM + 3);
  const zA = z1 + 4, z2 = zA + 1, zB = z2 + 4;
  // shelf A: a chunky corbelled shelf (its underside steps back into the cliff)
  const jit = (x, y) => (hash3(x, y >> 3, 0, 9) < 0.3 ? 1 : 0);
  const endsA = (x) => { const e = Math.min(x - (FX - 5), FX + 6 - x); return e < 2 ? 2 - e : 0; };
  const under = [0, 0, 1, 3, 5, 8, 11];
  rockMass(FX - 5, FX + 6, yA, yA - 6, (x, y) => zA - endsA(x) - jit(x, yA) - under[yA - y] - (yA - y > 1 && hash3(x, y, 1, 4) < 0.4 ? 1 : 0), 7);
  // buttress B: a rock buttress from the basin floor up to the second shelf, flaring a little toward its foot
  const endsB = (x) => { const e = Math.min(x - (FX - 7), FX + 9 - x); return e < 3 ? 3 - e : 0; };
  const frontB = (x, y) => zB - endsB(x) - jit(x + 3, y) + (y < yB - 7 ? 1 : 0) + (y < 19 ? 1 : 0);
  rockMass(FX - 7, FX + 9, yB, 6, frontB, 16);
  let z3 = -120;
  for (let x = F3[0]; x <= F3[1]; x++) for (let y = POOL_Y - 2; y <= yB; y++) z3 = Math.max(z3, frontB(x, y));
  z3 += 1;
  pond(FX - 5, FX + 6, yA, zA, F1, F2);
  pond(FX - 7, FX + 9, yB, zB, F2, F3);
  // the spring's jet: out of the slot it arcs down a voxel every cell or two and turns into tier 1 at the brink;
  // shaded by distance (pale blue in the slot → white → foam at the brink)
  const jetY = (z) => lipY - Math.floor((z - zM) / 2);                    // zM+1: lipY, zM+2/3: lipY-1, …
  sheet(F1[0], F1[1], jetY(z1) - 1, yA + 1, z1, 1);
  for (let x = F1[0]; x <= F1[1]; x++) for (let z = zM + 1; z <= z1; z++) {
    const y = jetY(z), t = (z - zM) / (z1 - zM);
    g.set(x, y, z, t >= 1 ? foam : t > 0.5 ? white[0] : white[hash3(x, y, z, 5) < 0.5 ? 0 : 2]);
    if (z < z1) g.set(x, y - 1, z, white[2]);                                          // the jet's underside
    else { g.set(x, y - 1, z, foam); if (hash3(x, 1, z, 6) < 0.5) g.set(x, y - 2, z, foam); }   // foam under the brink
  }
  sheet(F2[0], F2[1], yA, yB + 1, z2, 2);
  basin(frontB);
  sheet(F3[0], F3[1], yB, POOL_Y - 2, z3, 3);
  splash((F1[0] + F1[1]) / 2, yA, z1, 2.6);
  splash((F2[0] + F2[1]) / 2, yB, z2, 3.4);
  splash((F3[0] + F3[1]) / 2, POOL_Y, z3 + 1, 5);
  // spray: short faint boxes over the bottom 5 voxels of each tier only
  for (const [x0, x1, y0, z0, z1b, n] of [[F1[0] - 2, F1[1] + 2, yA, z1 - 1, z1 + 3, 1], [F2[0] - 2, F2[1] + 2, yB, z2 - 1, z2 + 3, 2], [F3[0] - 3, F3[1] + 3, POOL_Y, z3 - 1, z3 + 5, 3]])
    ctx.emit('particles', { preset: 'mist', box: [[x0, y0, z0], [x1, y0 + 5, z1b]], count: 22, size: 3.2, opacity: 0.2, glow: 1, colors: ['#ffffff', '#f6efe4'], seed: n });
  sprayPaint();

  // ---- 3. the plunge pool: gentle mossy banks (so the water shows), boulders, stepping stones ----
  const PC = [POOL.x, POOL.z];
  const landY = regrade();                                               // (x, z) → ground top after regrading
  const outlet = Math.atan2(-41 - PC[1], -69 - PC[0]);                 // where the river leaves (south)
  const boulders = [];
  for (let i = 0; i < 13; i++) {
    const th = 0.2 + (i / 13) * Math.PI * 2 + (hash3(i, 1, 2, 3) - 0.5) * 0.3;
    if (Math.abs(Math.atan2(Math.sin(th - outlet), Math.cos(th - outlet))) < 0.5) continue;
    const r = POOL.r + 1 + hash3(i, 2, 2, 3) * 2, x = Math.round(PC[0] + Math.cos(th) * r), z = Math.round(PC[1] + Math.sin(th) * r);
    if (z < z3 + 3 && Math.abs(x - FX) < 12) continue;                      // the basin side: done separately
    const front = Math.sin(th) > 0.3 && Math.cos(th) > -0.5;               // south-east rim: keep low (camera side)
    const big = !front && hash3(i, 3, 2, 3) < 0.6, sz = big ? [4, 3.6, 3.6] : [2.6, 2, 2.4];
    rock(g, [x, landY(x, z) - 2, z], { size: sz, stone: ['limestoneDark', 'limestone', 'limestoneLight'], moss: 'falls_wetMoss', bury: 0.15, seed: 40 + i });
    boulders.push([x, colTop(x, z) + 1, z, big]);
  }
  // around the basin: big wet blocks fallen from the cliff
  for (const [x, z, s, sd] of [[FX - 10, z3 + 3, 3.6, 1], [FX + 9, z3 + 2, 3.2, 2], [FX + 6, z3 + 8, 2.2, 3], [FX - 13, z3 + 9, 3, 4]]) {
    rock(g, [x, Math.max(POOL_Y - 3, landY(x, z) - 3), z], { size: [s, s * 0.8, s * 0.9], stone: ['falls_wetRock', 'limestoneDark', 'limestone'], moss: 'falls_wetMoss', bury: 0.1, seed: 60 + sd });
    boulders.push([x, colTop(x, z) + 1, z, true, sd]);
  }
  // the king cobra's sunning rock: a pale mossy boulder east of the basin, in view of the default camera
  const CR = [-52, -67];
  rock(g, [CR[0], landY(CR[0], CR[1]) - 1, CR[1]], { size: [3.4, 3.2, 3.1], stone: ['limestone', 'limestoneLight', 'limestoneLight'], moss: 'falls_wetMoss', bury: 0.1, facet: 0.5, seed: 91 });
  const cobraTop = [CR[0], colTop(CR[0], CR[1]) + 1, CR[1]];
  const stones = [];
  for (const [x, z, s, sd] of [[-57, -54, 1.8, 1], [-67, -50, 1.4, 2], [-71, -59, 1.6, 3], [-60, -63, 1.3, 4]]) {   // stepping stones / perches
    rock(g, [x, POOL_Y - 3, z], { size: [s, 2.6, s], stone: ['limestoneDark', 'limestone', 'limestoneLight'], moss: 'falls_wetMoss', bury: 0, seed: 80 + sd });
    stones.push([x, colTop(x, z) + 1, z]);
  }

  // ---- 4. forest: a strangler fig at the cliff foot, rainforest on the slopes, an open fern glade around the pool ----
  const fig = strangler(g, [-86, landY(-86, -69) + 1, -69], { height: 38, crownRadius: 11, doorAngle: 0.6, aerial: 16, fruit: false, seed: 7, leaves: ['canopyBlue', 'jungleLeafDark', 'jungleLeaf', 'jungleLeafLight'] });
  // the glade: open toward the camera (south-east of the pool nothing taller than a fern, so the water shows)
  const CLEAR = [[-80, -86], [-46, -45]], OPEN = [[-68, -62], [-41, -41]];
  // one big dark round crown at the massif's west foot (no pale umbrella emergents) and one flowering accent by the pool
  jungleTree(g, [-107, landY(-107, -57) + 1, -57], { height: 34, style: 'round', crownRadius: 10, bias: -0.1, trunk: ['barkDark', 'bark'], leaves: ['canopyBlue', 'jungleLeafDark', 'jungleLeaf', 'jungleLeafLight'], seed: 21 });
  jungleTree(g, [-86, landY(-86, -49) + 1, -49], { height: 21, style: 'round', crownRadius: 7, bias: -0.1, seed: 22 });
  const inOpen = (x, z) => x >= OPEN[0][0] && z >= OPEN[0][1];
  const forest = rainforest(g, [-119, -119], [-41, -41], {
    on: GROUND, avoid: [CLEAR, OPEN], border: false, overhang: 1, height: [17, 28], emergents: 0, flowering: 0, density: 0.9,
    gaps: 0.15, edge: 4, seed: R.int(0, 1e6),
  });
  // around the pool: tree ferns, alocasia and heliconia behind it (north / west), low ferns in front
  const glade = [];
  for (let i = 0; i < 30; i++) {
    const th = (i / 30) * Math.PI * 2 + hash3(i, 5, 5, 1) * 0.2, r = POOL.r + 3 + hash3(i, 6, 5, 1) * 6;
    const x = Math.round(PC[0] + Math.cos(th) * r), z = Math.round(PC[1] + Math.sin(th) * r);
    if (x < CLEAR[0][0] + 1 || z < z3 + 4 || x > -43 || z > -43) continue;
    const y = landY(x, z);
    if (y == null || colTop(x, z) !== y || !GROUND_IDS.has(g.get(x, y, z))) continue;
    glade.push([x, y + 1, z, i, inOpen(x, z) || (x > PC[0] + 4 && z > PC[1] - 8)]);
  }
  for (const [x, y, z, i, front] of glade) {
    const kind = i % 5;
    if (front) { if (kind !== 4) fern(g, [x, y, z], { radius: 2.2 + (i % 3) * 0.3, height: 2, seed: 140 + i }); continue; }
    if (kind <= 1) treeFern(g, [x, y, z], { height: 7 + (i % 4), seed: 100 + i });
    else if (kind === 2) alocasia(g, [x, y, z], { count: 5, seed: 120 + i });
    else if (kind === 3 && i % 2) heliconia(g, [x, y, z], { seed: 160 + i });
    else fern(g, [x, y, z], { radius: 3.4, seed: 140 + i });
  }
  bamboo(g, [-79, landY(-79, -44) + 1, -44], { height: 15, seed: 3 });
  // shelves and buttress: spray-loving ferns, pitcher plants, a little tree fern on the buttress shoulder
  const onRockTop = (x, z, yMax) => { let y = yMax; while (y > POOL_Y && !g.get(x, y, z)) y--; return ROCKS.has(g.get(x, y, z)) || g.get(x, y, z) === wet || g.get(x, y, z) === wetMoss ? y + 1 : null; };
  for (const [x, z, what] of [[FX + 7, zB - 2, 'treeFern'], [FX - 6, zB - 1, 'pitcher'], [FX + 5, zB - 4, 'fern'], [FX - 4, zA - 1, 'fern'], [FX + 5, zA - 1, 'fern'], [FX + 8, zB, 'pitcher'], [FX - 8, zB - 3, 'fern']]) {
    const y = onRockTop(x, z, yA + 3);
    if (y == null) continue;
    if (what === 'treeFern') treeFern(g, [x, y, z], { height: 6, seed: 7 });
    else if (what === 'pitcher') pitcherPlant(g, [x, y, z], { count: 3, seed: x * 3 + z });
    else fern(g, [x, y, z], { radius: 2.6, leaves: ['fernDark', 'fern', 'fernLight'], seed: x + z });
  }
  const basinBox = [[FX - 9, z3 - 1], [FX + 10, z3 + 12]];
  undergrowth(g, [-96, -90], [-41, -41], { on: GROUND, density: 0.75, avoid: [basinBox, OPEN], mix: { pitcher: 0.1, treeFern: 0.1 }, seed: R.int(0, 1e6) });
  undergrowth(g, OPEN[0], OPEN[1], { on: GROUND, density: 0.8, avoid: [basinBox], scale: 0.8, mix: { alocasia: 0, heliconia: 0, seedling: 0.6, flower: 0.7 }, seed: R.int(0, 1e6) });
  // a mossy fallen trunk bridging the river below the pool
  fallenLog(g, [-80, landY(-80, -48) + 1, -48], [-60, landY(-60, -47) + 1, -47], { radius: 1.9, fungi: 4, ferns: 2, seed: 9 });
  epiphytes(g, { area: [[-100, 16, -84], [-44, 60, -42]], density: 0.12, seed: 3 });   // the trees around the glade (close-up detail)
  const tips = [];
  for (const t of forest.trees) if (t.limbs?.length && hash3(t.base[0], 0, t.base[2], 7) < 0.25) tips.push(t.limbs[0]);
  for (const t of fig.limbs.slice(0, 3)) tips.push(t);
  lianas(g, tips, { connect: 0.35, dangle: 0.25, seed: 11 });

  // ---- 5. haze on the west tower, the rainbow ----
  mistBand();
  rainbow([FX - 3, 21, z3 + 2], 11);   // over the lowest plunge; last: nothing may grow on it

  // ---- 6. life ----
  const [sx, sy, sz] = main.top;
  ctx.emit('actors', { ...LIFE.hornbillCircle, count: 2, center: [sx, sy + 8, sz], radius: 15, seed: 3 });
  // rock tops (2 free cells above) in a box near a height: perches and seats on the shelves
  const RESTS = new Set([...ROCKS, wet, wetMoss]);
  const restSpots = (xa, xb, za, zb, y0, y1, n, gap = 2) => {
    const c = [];
    for (let x = xa; x <= xb; x++) for (let z = za; z <= zb; z++) for (let y = y1; y >= y0; y--) {
      if (RESTS.has(g.get(x, y, z)) && !g.get(x, y + 1, z) && !g.get(x, y + 2, z) && !g.get(x, y + 3, z)) { c.push([x, y + 1, z, hash3(x, y, z, 51)]); break; }
      if (g.get(x, y, z)) break;
    }
    c.sort((p, q) => p[3] - q[3]);
    const out = [];
    for (const p of c) if (out.length < n && out.every((q) => Math.max(Math.abs(q[0] - p[0]), Math.abs(q[2] - p[2])) >= gap)) out.push(p);
    return out;
  };
  // a kingfisher darting between rocks around the fall-2 basin (buttress B) and shelf A — in view, unlike the pool
  const perches = [...restSpots(FX - 8, FX - 4, zB - 6, zB + 1, yB - 2, yB + 4, 2, 3), ...restSpots(FX + 5, FX + 9, zB - 6, zB + 1, yB - 2, yB + 4, 2, 3), ...restSpots(FX + 4, FX + 7, zA - 5, zA + 1, yA - 2, yA + 3, 1)]
    .map(([x, y, z]) => [x + 0.5, y, z + 0.5]);
  if (perches.length >= 2) ctx.emit('actors', { ...LIFE.kingfisher, count: 1, spots: perches, seed: 4 });
  else console.warn('falls: no kingfisher perches');
  ctx.emit('actors', { ...LIFE.dragonfly, count: 4, area: [[-72, -63], [-56, -49]], seed: 5 });
  ctx.emit('actors', { ...LIFE.fish, count: 4, area: [[-71, -63], [-57, -49]], seed: 6 });
  ctx.emit('actors', { ...LIFE.butterfly, count: 4, area: [[-52, -60], [-43, -44]], seed: 7 });   // over the dry glade, not the water
  ctx.emit('actors', { ...LIFE.birdwing, count: 2, area: [[-76, -70], [-48, -46]], seed: 8 });
  // dusky langurs sitting on the dry left end of shelf A, beside the upper fall
  const langurs = restSpots(FX - 7, FX - 3, zA - 6, zA + 1, yA - 2, yA + 3, 3, 2).map(([x, y, z], i) => [x + 0.5, y, z + 0.5, [70, 140, 20][i]]);
  if (langurs.length) ctx.emit('actors', { ...LIFE.langur, spots: langurs, seed: 9 });
  else console.warn('falls: no langur seats on shelf A');
  // a serow (dark goat-antelope of the cliffs), a static voxel figure standing broadside on a little ledge above the
  // spring, pale rock behind it
  const serow = serowFigure(FX - 9, my + 10);
  if (!serow) console.warn('falls: no serow ledge');
  // a king cobra rearing, hood up, on a mossy boulder beside the plunge basin; a pig-tailed macaque on the log bridge
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 5; dy++) {   // nothing growing over it
    const id = g.get(cobraTop[0] + dx, cobraTop[1] + dy, cobraTop[2] + dz);
    if (id && !RESTS.has(id)) g.set(cobraTop[0] + dx, cobraTop[1] + dy, cobraTop[2] + dz, 0);
  }
  const cobraRock = cobraTop;
  if (cobraRock) ctx.emit('actors', { creature: 'snake', options: { kind: 'cobra' }, behavior: 'still', spots: [[cobraRock[0] + 0.5, cobraRock[1], cobraRock[2] + 0.5, 200]], seed: 11 });
  const logY = colTop(-67, -47) + 1;
  ctx.emit('actors', { ...LIFE.macaque, options: { kind: 'pigtail' }, spots: [[-66.5, logY, -46.5, 160]], seed: 12 });

  // ---- helpers (closures over the grid) ----
  function skirt(cx, cz, y0, y1, maxE, half) {
    // grow the tower's own outline outward in stepped bands (chessboard dilation per layer: rectilinear like the karst),
    // e voxels at the foot → 0 at y1; streaked faces, mossy step tops
    const x0 = cx - half - maxE, z0 = cz - half - maxE, W = 2 * (half + maxE) + 1, A = W * W;
    const dist = new Float32Array(A), BIG = 1e6, stone = M('limestone'), streak = M('limestoneStreak'), orange = M('limestoneOrange'), moss = M('karstMoss'), light = M('limestoneLight');
    const starts = [y0];                                                       // irregular band heights (4–8)
    while (starts[starts.length - 1] < y1) starts.push(starts[starts.length - 1] + 3 + Math.floor(hash3(cx, starts.length, cz, 43) * 6));
    const eAt = (y) => { let b = 0; while (starts[b + 1] <= y) b++; return maxE * (1 - (starts[b] - y0) / (y1 - y0)); };
    const treads = [], put = [], gullies = [hash3(cx, 1, cz, 44) * Math.PI * 2, 0].map((a, i, arr) => (i ? arr[0] + Math.PI * (0.8 + 0.4 * hash3(cx, 2, cz, 44)) : a));
    for (let bi = 0; bi + 1 < starts.length; bi++) {                       // one dilation per band (of the band's union)
      const ya = starts[bi], yb = Math.min(starts[bi + 1] - 1, y1), e = eAt(ya);
      if (e < 0.5) continue;
      for (let i = 0; i < A; i++) dist[i] = BIG;
      g.forEachIn([x0, ya, z0], [x0 + W - 1, yb, z0 + W - 1], (x, yy, z, id) => { if (ROCKS.has(id)) dist[(z - z0) * W + x - x0] = 0; });
      for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {               // chessboard distance, forward pass
        const i = z * W + x;
        let d = dist[i];
        if (!d) continue;
        if (x > 0) d = Math.min(d, dist[i - 1] + 1);
        if (z > 0) { d = Math.min(d, dist[i - W] + 1); if (x > 0) d = Math.min(d, dist[i - W - 1] + 1); if (x < W - 1) d = Math.min(d, dist[i - W + 1] + 1); }
        dist[i] = d;
      }
      for (let z = W - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {      // backward pass
        const i = z * W + x;
        let d = dist[i];
        if (!d) continue;
        if (x < W - 1) d = Math.min(d, dist[i + 1] + 1);
        if (z < W - 1) { d = Math.min(d, dist[i + W] + 1); if (x < W - 1) d = Math.min(d, dist[i + W + 1] + 1); if (x > 0) d = Math.min(d, dist[i + W - 1] + 1); }
        dist[i] = d;
      }
      for (let i = 0; i < A; i++) {
        const d = dist[i];
        if (!d || d > e * 1.15) continue;
        const x = x0 + (i % W), z = z0 + ((i / W) | 0), f = 0.45 + 0.7 * (N.simplex2(x * 0.09 + cx, z * 0.09) + 1) / 2;   // sides flare differently
        if (d > Math.round(e * f + (hash3(x, ya, z, 7) - 0.5) * 3)) continue;   // ragged per column: talus, not a ziggurat
        const th = Math.atan2(z - cz, x - cx);
        if (gullies.some((a) => Math.abs(Math.atan2(Math.sin(th - a), Math.cos(th - a))) * Math.hypot(x - cx, z - cz) < 1.6)) continue;   // two gullies cut through every ring
        for (let y = ya; y <= yb; y++) put.push(x, y, z);
      }
    }
    for (let i = 0; i < put.length; i += 3) if (!g.get(put[i], put[i + 1], put[i + 2]) || !isRock(put[i], put[i + 1], put[i + 2])) g.set(put[i], put[i + 1], put[i + 2], stone);
    for (let i = 0; i < put.length; i += 3) {
      const x = put[i], y = put[i + 1], z = put[i + 2];
      if (!g.get(x, y + 1, z)) {
        const n = N.simplex2(x * 0.25, z * 0.25);
        g.set(x, y, z, n > 0.25 ? moss : n > -0.3 ? light : stone);
        if (!(x & 3) && !(z & 3) && hash3(x, y, z, 45) < 0.4) treads.push([x, y + 1, z]);   // ~40 % of the treads get a plant
        continue;
      }
      const h = hash3(x * 3 + z, 0, x - z * 3, 41), band = Math.floor((y - y0) / 6);
      if (h < 0.14) g.set(x, y, z, h < 0.02 ? orange : streak);                   // vertical rain streaks
      else if (hash3(x, band, z, 42) < 0.05) g.set(x, y, z, streak);
    }
    for (const [x, y, z] of treads) {
      if (g.get(x, y, z)) continue;
      if (hash3(x, y, z, 46) < 0.6) fern(g, [x, y, z], { radius: 2 + hash3(x, 1, z, 47) * 1.2, height: 2.5, seed: x * 7 + z });
      else foliage(g, [{ c: [x, y + 1, z], r: 1.8 + hash3(x, 2, z, 47) }, { c: [x + 1, y + 0.5, z], r: 1.4 }], { leaves: LEAVES, seed: x * 13 + z, squash: 0.7, roughness: 0.3, mode: 'keep' });
    }
  }
  function serowFigure(xa, yFeet) {
    // body along +x (≈ broadside to the yaw-20 camera), head at +x; feet stand on a corbelled ledge built out of the face
    const C = { body: P.add('falls_serow', { color: '#2f2d2c', jitter: 0.04 }), back: P.add('falls_serowBack', { color: '#1f1c1a', jitter: 0.03 }),
      leg: P.add('falls_serowLeg', { color: '#8a5a3a', jitter: 0.04 }), mane: P.add('falls_serowMane', { color: '#d8d0c2', jitter: 0.03 }),
      muzzle: P.add('falls_serowMuzzle', { color: '#5a5550', jitter: 0.03 }), horn: P.add('falls_serowHorn', { color: '#151210', jitter: 0.02 }) };
    let zf = -120;                                                          // front-most face behind the figure
    for (let x = xa - 1; x <= xa + 11; x++) for (let y = yFeet; y <= yFeet + 10; y++) zf = Math.max(zf, faceZ(x, y));
    if (zf < -110) return null;
    const oz = zf + 1;                                                      // body z = oz … oz+2
    for (let x = xa - 2; x <= xa + 12; x++) for (let y = yFeet - 4; y <= yFeet + 11; y++) for (let z = oz; z <= oz + 9; z++) { const id = g.get(x, y, z); if (id && !ROCKS.has(id) && (y >= yFeet || z > oz + 3)) g.set(x, y, z, 0); }
    for (let x = xa - 1; x <= xa + 8; x++) for (let k = 0; k < 3; k++) {     // the ledge: 4 deep at the top, corbelled back below
      const y = yFeet - 1 - k;
      for (let z = faceZ(x, y) + 1; z <= oz + 3 - k * 2; z++) g.set(x, y, z, k === 0 ? (hash3(x, y, z, 71) < 0.5 ? M('karstMoss') : M('limestoneLight')) : M('limestone'));
    }
    for (let x = xa - 3; x <= xa + 12; x++) for (let y = yFeet - 1; y <= yFeet + 10; y++) for (let z = oz - 1; z >= oz - 2; z--) if (isRock(x, y, z) || g.get(x, y, z) === wet || g.get(x, y, z) === wetMoss) g.set(x, y, z, M(y === yFeet - 1 ? 'limestone' : 'limestoneLight'));   // pale rock behind
    const put = (x, y, z, m) => g.set(xa + x, yFeet + y, oz + z, m);
    for (const lx of [1, 5]) for (const lz of [0, 2]) for (let y = 0; y < 3; y++) put(lx, y, lz, y < 2 ? C.leg : C.body);   // legs
    for (let x = 0; x <= 6; x++) for (let y = 3; y <= 5; y++) for (let z = 0; z <= 2; z++) put(x, y, z, y === 5 && z === 1 ? C.back : C.body);
    put(-1, 4, 1, C.back);                                                  // tail stub
    for (const z of [1, 2]) {                                               // neck rising forward, head carried high
      put(6, 6, z, C.body); put(7, 6, z, C.body); put(7, 7, z, C.body);
      for (let x = 8; x <= 10; x++) for (let y = 7; y <= 8; y++) put(x, y, z, x === 10 ? C.muzzle : C.body);
      put(8, 9, z, C.horn); put(7, 10, z, C.horn);                         // short straight horns: up, then back
    }
    put(5, 6, 1, C.mane); put(6, 7, 1, C.mane); put(7, 8, 1, C.mane);     // pale mane ridge along the neck
    put(8, 8, 0, C.body); put(8, 8, 3, C.body);                           // donkey ears out to the sides
    return [xa + 5, yFeet, oz + 1];
  }
  function summitClumps([sx0, sy0, sz0], n) {
    const c = [];
    for (let x = sx0 - 14; x <= sx0 + 14; x++) for (let z = sz0 - 14; z <= sz0 + 14; z++) {
      let y = sy0 + 2;
      while (y > sy0 - 12 && !g.get(x, y, z)) y--;
      if (!isRock(x, y, z) || y < sy0 - 10) continue;
      let inset = true;                                                     // all around at least as high (inside the outline)
      for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2], [2, -2], [-2, 2]]) { let yy = y + 3; while (yy > y - 2 && !isRock(x + dx, yy, z + dz)) yy--; if (yy < y - 1) { inset = false; break; } }
      if (inset) c.push([x, y + 1, z, hash3(x, y, z, 81)]);
    }
    c.sort((a, b) => a[3] - b[3]);
    const out = [];
    for (const p of c) if (out.length < n && out.every((q) => Math.hypot(q[0] - p[0], q[2] - p[2]) >= 5)) out.push(p);
    for (const [x, y, z] of out) foliage(g, [{ c: [x, y + 0.5, z], r: 2.4 }, { c: [x + 1, y, z + 1], r: 1.8 }], { leaves: LEAVES, seed: x * 31 + z, squash: 0.7, roughness: 0.3, mode: 'keep' });
  }
  function shoulder(yS, za, zb, depth) {
    // cut the tower's +x face back `depth` voxels above yS (a shoulder ledge); the hollow karst gets a new 4-thick wall
    // and a solid, mossy ledge floor; a shrub on the ledge, a couple of rain streaks on the new face
    const stone = M('limestone'), moss = M('karstMoss'), streak = M('limestoneStreak');
    let shrub = null;
    for (let z = za; z <= zb; z++) {
      let xe = null;
      for (let x = -42; x >= -84; x--) if (isRock(x, yS, z)) { xe = x; break; }
      if (xe == null) continue;
      const xn = xe - depth - (hash3(0, yS, z >> 2, 61) < 0.5 ? 0 : 1);
      for (let y = yS; y <= 125; y++) {
        let cut = false;
        for (let x = xn + 1; x <= xe + 6; x++) { const id = g.get(x, y, z); if (id) { if (ROCKS.has(id)) cut = true; g.set(x, y, z, 0); } }
        if (cut) for (let x = xn - 3; x <= xn; x++) if (!g.get(x, y, z)) g.set(x, y, z, x === xn && hash3(z >> 1, 3, x, 62) < 0.12 ? streak : stone);
      }
      for (let y = yS - 4; y < yS; y++) for (let x = xn + 1; x <= xe; x++) if (!g.get(x, y, z) || (y === yS - 1 && isRock(x, y, z))) g.set(x, y, z, y === yS - 1 ? moss : stone);
      if (z === Math.round((za + zb) / 2)) shrub = [xn + Math.round(depth / 2), yS, z];
    }
    if (shrub) foliage(g, [{ c: [shrub[0], shrub[1] + 1, shrub[2]], r: 2.6 }, { c: [shrub[0] + 1, shrub[1] + 0.5, shrub[2] + 2], r: 2 }, { c: [shrub[0] - 1, shrub[1] + 1, shrub[2] - 2], r: 1.8 }], { leaves: LEAVES, seed: 63, squash: 0.75, roughness: 0.3, mode: 'keep' });
  }
  function rockMass(xa, xb, yTop, yBot, front, reach = 24) {
    for (let x = xa; x <= xb; x++) {
      let ok = false;                                                   // only where the cliff is within reach behind
      for (let z = front(x, yTop), k = 0; k <= reach && !ok; k++, z--) ok = isRock(x, yTop, z) || isRock(x, yTop - 2, z);
      if (!ok) continue;
      for (let y = yBot; y <= yTop; y++) for (let z = front(x, y), zEnd = z - reach; z >= zEnd; z--) {
        if (isRock(x, y, z)) break;                                     // reached the cliff
        g.set(x, y, z, y === yTop ? (N.simplex2(x * 0.3, z * 0.3) > 0.1 ? M('karstMoss') : M('limestoneLight')) : M('limestone'));
      }
    }
  }
  function pond(xa, xb, yTop, zFront, landX, spillX) {
    // 1-deep pool on a shelf top: interior cells hold water, the rim stays rock, a spill notch where the next fall leaves
    for (let x = xa + 2; x <= xb - 2; x++) for (let z = zFront - 1; z >= zFront - 14; z--) {
      if (!isRock(x, yTop, z) || isRock(x, yTop + 1, z)) continue;
      if (isRock(x - 1, yTop + 1, z) || isRock(x + 1, yTop + 1, z) || isRock(x, yTop + 1, z - 1)) continue; // keep a lip against the cliff
      g.set(x, yTop, z, water);
    }
    for (let x = spillX[0]; x <= spillX[1]; x++) for (let z = zFront - 1; z <= zFront + 1; z++) if (isRock(x, yTop, z)) g.set(x, yTop, z, water);
  }
  function sheet(xa, xb, yTop, yBot, z, n) {
    for (let x = xa; x <= xb; x++) {
      const edge = x === xa || x === xb;
      for (let y = yBot; y <= yTop; y++) {
        const s = N.simplex2(x * 0.9 + n * 7, y * 0.07);                  // long vertical streaks
        if (edge && N.simplex2(x * 1.3 + 40, y * 0.3) < -0.3 && y < yTop - 2) continue;  // ragged spray edges
        g.set(x, y, z, s < -0.3 ? white[2] : white[0]);
        if (!edge && N.simplex2(x * 0.8 + 90 + n, y * 0.09) > 0.2) g.set(x, y, z + 1, s > 0.35 ? white[2] : white[0]);   // ribbons in front
        if (!g.get(x, y, z - 1)) g.set(x, y, z - 1, white[2]);                                                          // body
      }
    }
    ctx.emit('particles', { preset: 'rain', box: [[xa, yBot, z - 0.3], [xb + 1, yTop + 1, z + 1.8]], count: Math.round((xb - xa + 1) * (yTop - yBot) * 0.6),
      colors: ['#ffffff', '#e4f6fa'], size: 0.16, stretch: 9, speed: 3.4, glow: 1.25, opacity: 0.9, seed: n });
  }
  function splash(cx, y, cz, r) {
    // foam on the water where a fall lands (y = the water surface), a few bubbles above
    for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) for (let z = Math.floor(cz - r - 2); z <= cz + r + 2; z++) {
      const d = Math.hypot((x - cx) / 1.2, z - cz) / r + N.simplex2(x * 0.4, z * 0.4) * 0.25;
      if (d > 1.15 || g.get(x, y, z) !== water) continue;
      if (d < 0.6 || N.simplex2(x * 0.7 + 3, z * 0.7) > (d - 0.6) * 2.2 - 0.5) g.set(x, y, z, foam);
      if (d < 0.5 && !g.get(x, y + 1, z) && hash3(x, y, z, 22) < 0.55) g.set(x, y + 1, z, foam);
    }
  }
  function basin(front) {
    // plunge basin between the buttress and the pool: carved down into the ground, joined to the pool
    const cx = (F3[0] + F3[1]) / 2 + 1, cz = z3 + 4, rx = 10, rz = 7;
    for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) for (let z = z3 - 1; z <= cz + rz + 2; z++) {
      const e = Math.hypot((x - cx) / rx, (z - cz) / rz) + N.simplex2(x * 0.15, z * 0.15) * 0.18;
      if (e >= 1 || z <= front(x, POOL_Y)) continue;
      const c = columnAt(x, z);
      const bed = Math.min(c.kind === 'river' ? c.bed : 99, Math.round(POOL_Y - 1 - 4 * Math.sqrt(1 - e)));
      for (let y = bed + 1; y <= 30; y++) { const id = g.get(x, y, z); if (id && z > front(x, y)) g.set(x, y, z, 0); }
      g.set(x, bed, z, M('riverBed'));
      for (let y = bed + 1; y <= POOL_Y; y++) g.set(x, y, z, water);
    }
  }
  function rainbow(c, r0) {
    // a faint rainbow in the spray: 6 one-voxel bands on a plane facing the default camera (yaw 20), glass with no refraction
    const ux = Math.cos(CAMERA.yaw * Math.PI / 180), uz = -Math.sin(CAMERA.yaw * Math.PI / 180);
    for (let x = c[0] - r0 - 8; x <= c[0] + r0 + 8; x++) for (let z = c[2] - r0 - 8; z <= c[2] + r0 + 8; z++) {
      const dx = x + 0.5 - c[0], dz = z + 0.5 - c[2];
      const off = dx * -uz + dz * ux;                                       // distance from the plane (along the view)
      if (Math.abs(off) > 0.55) continue;
      const u = dx * ux + dz * uz;
      for (let y = c[1]; y <= c[1] + r0 + 7; y++) {
        const d = Math.hypot(u, y + 0.5 - c[1]), band = Math.floor(r0 + 6 - d);   // outer red … inner violet
        if (band < 0 || band > 5 || (y + 0.5 - c[1]) / d < 0.3 || g.get(x, y, z)) continue;
        g.set(x, y, z, M(`falls_rainbow${band}`));
      }
    }
  }
  function sprayPaint() {
    // wet dark rock in coherent patches around the falls (calm backdrop for the white water), moss on shelves
    const lo = [FX - 14, POOL_Y - 2, -98], hi = [FX + 15, lipY + 16, -60];
    paintIn(lo, hi, (x, y, z, id) => {
      if (!ROCKS.has(id)) return undefined;
      const n = N.simplex3(x * 0.12, y * 0.05, z * 0.12);
      const half = (y > lipY ? 4.5 - (y - lipY) * 0.2 : 8) + n * 3.5 + (y < yB + 2 ? 3 : 0);
      if (Math.abs(x - (FX + 0.5)) > half || z < z1 - 9) return undefined;
      const up = !g.get(x, y + 1, z);
      return up && N.simplex3(x * 0.35, y * 0.35, z * 0.35) > -0.25 ? wetMoss : wet;
    });
  }

  function mistBand() {
    // morning haze clinging to the west tower's waist: a flat ring of big faint sprites (no voxel clouds: from behind
    // the towers they read as cotton)
    ctx.emit('particles', { preset: 'mist', motion: 'drift', box: [[-119, 55, -117], [-87, 62, -85]], count: 25, size: 14, sizeJitter: 0.3, opacity: 0.15, glow: 1, colors: ['#ffffff', '#f6efe4'], speed: 0.015, seed: 5 });
  }

  function regrade() {
    // lower the land around the pool + basin into gentle mossy banks (only ground materials; tapers out toward the
    // south edge, where the river leaves the box, so the seam keeps base.js levels)
    const x0 = -84, x1 = -44, z0 = -86, z1 = -43, W = x1 - x0 + 1, D = z1 - z0 + 1;
    const T = g.tops(x0, z0, x1, z1), dist = new Float32Array(W * D), out = new Int32Array(W * D);
    const ground = new Set(['floor', 'floorLitter', 'floorMoss', 'bank'].map(M)), under = new Set([...ground, ...['soil', 'soilDark', 'laterite', 'clayBand'].map(M)]);
    for (let i = 0; i < W * D; i++) { dist[i] = T.id[i] === water ? 0 : 1e9; out[i] = T.y[i]; }
    for (const pass of [0, 1]) for (let k = 0; k < W * D; k++) {             // chamfer distance to the water
      const i = pass ? W * D - 1 - k : k, x = i % W, z = (i / W) | 0, s = pass ? 1 : -1;
      for (const [dx, dz, c] of [[s, 0, 1], [0, s, 1], [s, s, 1.41], [-s, s, 1.41]]) {
        const nx = x + dx, nz = z + dz;
        if (nx >= 0 && nx < W && nz >= 0 && nz < D) dist[i] = Math.min(dist[i], dist[nz * W + nx] + c);
      }
    }
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = (z - z0) * W + x - x0;
      if (!ground.has(T.id[i])) continue;
      const d = dist[i] + N.simplex2(x * 0.2, z * 0.2) * 0.8, top = T.y[i];
      const taper = clamp((-43 - z) / 6, 0, 1), target = Math.round(POOL_Y + 1 + Math.max(0, d - 1.2) * 0.75);
      const nt = Math.round(top - (top - Math.min(top, target)) * taper);
      if (nt >= top) continue;
      for (let y = nt + 1; y <= top; y++) if (under.has(g.get(x, y, z))) g.set(x, y, z, 0);
      g.set(x, nt, z, M(d < 2.6 ? 'bank' : N.simplex2(x * 0.15, z * 0.15) > -0.2 ? 'floorMoss' : 'floor'));
      out[i] = nt;
    }
    return (x, z) => (x >= x0 && x <= x1 && z >= z0 && z <= z1 ? out[(z - z0) * W + x - x0] : groundTop(x, z));
  }
  delete g.bounds;

  // ---- points of interest (the default yaw 20 frames the falls: no per-POI yaw needed) ----
  ctx.emit('poi', { label: 'The waterfall & rainbow', icon: '💦', target: [FX - 2, 40, z2], zoom: 3 });
  if (serow) ctx.emit('poi', { label: 'A serow above the spring', icon: '🐐', target: [serow[0], serow[1] + 4, serow[2]], zoom: 8 });
  if (langurs.length) ctx.emit('poi', { label: 'Langurs by the upper fall', icon: '🐒', target: [langurs[0][0] - 3, langurs[0][1] + 5, langurs[0][2]], zoom: 10 });
}
