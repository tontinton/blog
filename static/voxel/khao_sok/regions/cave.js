// The cave region (NC, x −40…39, z −120…−41): the limestone cave ridge with a big bat cave in its front face, a
// creek running out of the cave down to the lake, a boardwalk trail from a little lake landing up to the cave
// mouth (hikers + guide), a golden Buddha in a niche lit by butter lamps, bats streaming home, langurs on a ledge, a bamboo grove,
// rainforest and drowned trees in the shallows.
import { ground } from '../base.js';
import { KARSTS, CAVE, LIFE, LAKE_Y, isLake, lakeBedY, columnAt } from '../layout.js';
import {
  karst, cave, rock, foliage, rainforest, jungleTree, bamboo, banana, deadTree, fern, treeFern, alocasia, heliconia,
  undergrowth, liana, lianas, fallenLog, pitcherPlant, person, jetty, longtail, hash3, rng,
} from '../../lib/index.js';
import { creek, sampleLine, nearField, lineRects, boardwalk, buddha, batSign } from './cave-parts.js';

const SEED = 7;
const JL = ['jungleLeafDark', 'jungleLeaf', 'jungleLeafLight', 'jungleLeafSun'];
const FLOOR = ['floor', 'floorLitter', 'floorMoss'];
const GROUND = [...FLOOR, 'bank', 'shore', 'shoreRock', 'soil', 'soilDark', 'laterite', 'clayBand', 'bedrock', 'bedrockDark', 'riverBed', 'silt', 'sandJ'];

export default function build(g, ctx) {
  const [[X0, , Z0], [X1, , Z1]] = ctx.box;
  ground(g, ctx);
  ctx.clip = true;
  const P = ctx.P, R = ctx.rng;
  const add = (n, d) => (P.has(`cave_${n}`) ? P.id(`cave_${n}`) : P.add(`cave_${n}`, d));
  const M = {
    foam: add('foam', { color: '#e6f2ee', jitter: 0.03, roughness: 0.6 }),
    lamp: add('butterLamp', { color: '#ffc864', emissive: 4, flicker: 0.35, flickerSpeed: 1.2, light: { color: '#ffb050', radius: 5, intensity: 0.55 } }),
    headlamp: add('headlamp', { color: '#fff4d8', emissive: 5, light: { color: '#ffe8b8', radius: 7, intensity: 0.8 } }),
    saffron: add('saffron', { color: '#e88a18', jitter: 0.04 }),
    plinth: add('plinth', { color: '#8e8a80', jitter: 0.05 }),
    goldLight: add('goldLight', { color: '#ffe08a', metalness: 0.8, roughness: 0.3, emissive: 0.4 }),
    goldDark: add('goldDark', { color: '#b88a30', metalness: 0.8, roughness: 0.4 }),
    lotusBud: add('lotusBud', { color: '#f2a0c0', jitter: 0.03 }),
    ink: add('ink', { color: '#2a2018', jitter: 0.02 }),
    gold: P.id('templeGold'), red: P.id('templeRed'), marigold: P.id('marigold'), petal: P.id('petalWhite'),
    candle: P.id('candle'), incense: P.id('incense'), incenseTip: P.id('incenseTip'), lotus: P.id('templeWhite'),
    sash: P.id('cave_saffron'), lampCup: P.id('cave_goldDark'), rock: P.id('caveRock'), dark: P.id('caveDark'),
    post: P.id('beam'), board: P.id('plank'), boardDark: P.id('plankDark'), roof: P.id('thatchPalm'), roofDark: P.id('thatchPalmDark'),
  };
  const ids = (names) => new Set(names.map((n) => P.id(n)));
  const groundIds = ids(GROUND), floorIds = ids(FLOOR);
  const leafIds = ids(['jungleLeafDark', 'jungleLeaf', 'jungleLeafLight', 'jungleLeafSun', 'canopyBlue']);
  const rockIds = ids(['limestone', 'limestoneLight', 'limestoneDark', 'limestoneStreak', 'limestoneOrange', 'limestoneNotch', 'karstMoss', 'caveRock', 'caveDark', 'stalactite']);
  /** land top (ground materials only) or -Infinity */
  const topAt = (x, z) => { // (not g.top: that recomputes the grid bounds after every write)
    for (let y = 30; y > -14; y--) if (groundIds.has(g.get(x, y, z))) return y;
    return -Infinity;
  };
  const inBox = (x, z) => x >= X0 && x <= X1 && z >= Z0 && z <= Z1;

  // ---- the ridge --------------------------------------------------------------------------------------------
  const K = KARSTS.find((k) => k.id === 'ridge');
  const ridge = karst(g, K.base, { height: K.height, radius: [26, 13], profile: K.profile, peaks: K.peaks, seed: SEED, leaves: JL, trunk: 'barkPale', vines: 0.7, hollow: false });

  // the giant's crown (region giant) is seen against these summits from the default camera: keep its top edge backed
  // by sky / pale rock — no tree knob on the west summit, only low shrubs on the east summit cap
  {
    const veg = ids([...JL, 'canopyBlue', 'barkPale', 'barkPaleDark', 'barkPaleLight']);
    const moss = P.id('karstMoss'), pale = P.id('limestoneLight'), pale2 = P.id('limestone');
    const bare = (x0, x1, z0, z1, yMin, yMax, shrubs) => { // moss + a few low shrub clumps (≤ 3 tall) left on the rock, nothing else
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        let rt = -1;
        for (let y = yMax; y >= yMin - 12; y--) if (rockIds.has(g.get(x, y, z))) { rt = y; break; }
        const keep = shrubs && ctx.noise.simplex2(x * 0.32 + 7, z * 0.32) > 0.42 ? 3 : 0;
        for (let y = Math.max(yMin, rt + keep + 1); y <= yMax; y++) if (veg.has(g.get(x, y, z))) g.set(x, y, z, 0);
        if (rt >= yMin && !keep && g.get(x, rt, z) === moss && hash3(x, rt, z, 78) < 0.75) g.set(x, rt, z, hash3(x, rt, z, 79) < 0.5 ? pale : pale2);
      }
    };
    for (let x = -34; x <= -20; x++) for (let z = -112; z <= -96; z++) for (let y = 74; y <= 110; y++) if (veg.has(g.get(x, y, z))) g.set(x, y, z, 0);
    bare(-36, -18, -114, -94, 58, 110, false);   // west summit (peeks over the crown's upper edge): bare pale rock
    bare(-4, 16, -116, -91, 47, 100, true);      // east summit cap (behind the crown's right lobe): rock + a few low shrubs
  }

  // ---- the cave: a big arched mouth in the front cliff, entrance hall, chamber with a pool ---------------------
  const mx = CAVE.mouth[0], my = CAVE.mouth[1];
  let zFace = -200; // outermost rock of the cliff foot around the mouth
  for (let x = mx - 2; x <= mx + 2; x++) for (let y = my + 1; y <= my + 6; y++) for (let z = -70; z > -110; z--) if (rockIds.has(g.get(x, y, z))) { zFace = Math.max(zFace, z); break; }
  const mz = zFace + 1;
  for (let x = mx - 12; x <= mx + 12; x++) for (let y = my; y <= my + 20; y++) for (let z = mz - 3; z <= mz + 4; z++) if (leafIds.has(g.get(x, y, z))) g.set(x, y, z, 0);
  const cv = cave(g, [mx, my, mz], { dir: '+z', snap: false, width: 20, height: 19, depth: 12, chamber: 9, glow: false, water: 'riverWater', level: my - 1, stalactites: 0.14, length: 6, vines: false, seed: 5 });
  // a curtain of lianas framing the mouth: from the jungle on the cliff top down the face on both sides of the arch
  for (const [dx, len, sd] of [[-13, 15, 1], [-11, 10, 2], [9, 13, 3], [11, 17, 4], [-15, 8, 5]]) {
    const x = mx + dx;
    let top = my + 30, z = mz + 1;
    while (top > my + 10 && !rockIds.has(g.get(x, top, mz - 1)) && !leafIds.has(g.get(x, top, mz - 1))) top--;
    for (let k = 0; k < 6 && rockIds.has(g.get(x, top, z - 1)) === false && z > mz - 6; k++) z--;
    liana(g, [x, top, z], [x + Math.sign(dx), top - len, z + 1], { leaves: 0.12, twist: 0.4, seed: sd });
  }

  // ---- the creek: out of the cave, under the platform, down the valley toward the camera into the lake ------------
  // (the creek valley is the view corridor of the default camera: low vegetation only, so the mouth stays visible)
  const creekPts = [[mx, mz - 3], [mx + 0.5, mz + 4], [mx + 2.5, mz + 9], [mx + 6.5, mz + 13], [mx + 11.5, mz + 17], [mx + 15, mz + 23], [mx + 19, mz + 28.5], [mx + 24.5, mz + 32.5], [mx + 30, mz + 35], [mx + 35, mz + 37]];
  const creekS = creek(g, creekPts, {
    startY: my - 1, minY: LAKE_Y, water: 'riverWater', bed: 'riverBed', bank: 'bank', foam: M.foam, rocks: ['limestone', 'limestoneLight'], rockChance: 0.04,
    topAt: (x, z) => (z < mz ? my : topAt(x, z)), width: (t) => 1.3 + t * 1.7, maxWidth: 3.1, skip: (x, z) => isLake(x, z) || z < mz - 1, bankOn: groundIds,
  });

  // ---- layout of the trail: lake landing → boardwalk + stairs up the creek's east bank → platform at the mouth ----
  const trailPts = [[27.5, mz + 29.5], [23.5, mz + 28], [19.5, mz + 25], [15.5, mz + 20], [12, mz + 14], [7, mz + 10.5], [3.5, mz + 7.5], [2, mz + 4]];
  const platform = [[mx - 5, mz + 1], [mx + 6, mz + 6]]; // deck rectangle in front of the mouth (spans the creek)
  const landing = [[25, mz + 26], [38, mz + 33]];
  const apron = [[mx - 10, mz - 2], [mx + 8, mz + 8]];
  const bambooArea = [[mx - 24, mz + 2], [mx - 14, mz + 15]];
  const corridor = [...lineRects(creekPts.slice(1), 5, 2), ...lineRects(trailPts, 4, 2)];
  const trailCells = new Set(); // keep plants off the boardwalk
  for (const c of nearField(sampleLine(trailPts, 0.5), 3)) trailCells.add(`${c.x},${c.z}`);
  const creekCells = new Map();
  for (const c of nearField(creekS, 6)) creekCells.set(`${c.x},${c.z}`, { d: c.d, t: creekS[c.i].s / creekS[creekS.length - 1].s, i: c.i });

  // ---- seams: a thin dummy ground just outside the west and south edges so the forest runs on across them (dropped
  // by the box clip at the end) ----
  for (let x = X0 - 5; x <= X1; x++) for (let z = Z0; z <= Z1 + 5; z++) {
    if (inBox(x, z)) continue;
    const c = columnAt(x, z);
    if (c.kind === 'land') g.set(x, c.top, z, P.id('floor'));
  }

  // ---- rainforest everywhere else (the ridge's rock isn't 'floor', so it stays bare) ----
  const forest = rainforest(g, [X0 - 5, Z0], [X1, Z1 + 5], {
    on: FLOOR, height: [16, 26], density: 0.95, avoid: [...corridor, apron, bambooArea, landing], emergents: 0, overhang: 1, flowering: 0, seed: 101,
  });

  // ---- bamboo grove framing the platform on the west ----
  for (const [x, z, h] of [[mx - 19, mz + 4, 21], [mx - 22, mz + 8, 17], [mx - 17, mz + 10, 19], [mx - 20, mz + 13, 15]]) {
    const y = topAt(x, z);
    if (Number.isFinite(y)) bamboo(g, [x, y + 1, z], { height: h, seed: x * 31 + z, fan: 14 });
  }

  const boulders = [];
  // ---- the creek valley: low riverside plants (ferns, elephant ears, heliconia, bananas, tree ferns), mossy boulders ----
  {
    const RV = rng(77);
    const free = (x, z) => !trailCells.has(`${x},${z}`) && inBox(x, z) && floorIds.has(g.get(x, topAt(x, z), z)) && !g.get(x, topAt(x, z) + 1, z);
    const plant = (x, z, fn) => { if (!free(x, z)) return; const y = topAt(x, z); fn([x, y + 1, z]); };
    for (const [k, c] of creekCells) {
      const [x, z] = k.split(',').map(Number);
      if (c.d < 2.6 || c.d > 6 || c.t < 0.12) continue;
      const h = hash3(x, 5, z, 61);
      if (h < 0.035) plant(x, z, (p) => fern(g, p, { radius: 2 + RV.int(0, 1), seed: RV.int(0, 1e6) }));
      else if (h < 0.05 && c.t > 0.3) plant(x, z, (p) => alocasia(g, p, { count: 3, height: 4, seed: RV.int(0, 1e6) }));
      else if (h < 0.058) plant(x, z, (p) => heliconia(g, p, { height: 5, seed: RV.int(0, 1e6) }));
      else if (h < 0.066 && c.t > 0.4) plant(x, z, (p) => banana(g, p, { height: 4, seed: RV.int(0, 1e6) }));
      else if (h < 0.07 && c.t > 0.55 && c.d > 4) plant(x, z, (p) => treeFern(g, p, { height: 7 + RV.int(0, 2), seed: RV.int(0, 1e6) }));
    }
    // a few small riverside trees on the far (west) bank, low enough to keep the view of the cave
    for (const [x, z, h] of [[mx + 4, mz + 18, 10], [mx + 9, mz + 25, 11], [mx + 15, mz + 31, 12], [mx + 25, mz + 38, 9]]) plant(x, z, (p) => jungleTree(g, p, { height: h, style: 'round', crownRadius: 3.5, seed: x * 13 + z, bias: -0.04,
      ...(x === mx + 15 ? { flowers: 'flameFlower', flowerAmount: 0.5, crownRadius: 4.5 } : {}) })); // the region's one flowering crown, by the landing
    // mossy limestone boulders tumbled from the cliff, along the creek
    for (const [x, z, r] of [[mx - 7, mz + 9, 2.2], [mx + 1, mz + 12, 1.6], [mx + 9, mz + 21, 2], [mx + 17, mz + 27, 1.7], [mx + 22, mz + 35, 2.4], [mx + 6, mz - 1, 1.8], [mx - 9, mz - 1, 2.3]]) {
      const y = topAt(x, z);
      if (!Number.isFinite(y)) continue;
      rock(g, [x, y + 1, z], { size: [r, r * 0.8, r * 0.9], stone: ['limestoneDark', 'limestone', 'limestoneLight'], moss: 'karstMoss', bury: 0.3, seed: x * 3 + z });
      let t = y + 8;
      while (t > y && !rockIds.has(g.get(x, t, z))) t--;
      for (let k = t + 1; k <= t + 6; k++) if (g.get(x, k, z)) g.set(x, k, z, 0); // nothing growing on the top
      boulders.push([x + 0.5, t + 1, z + 0.5]);
    }
    // a mossy fallen log bridging the creek in the lower valley; pitcher plants on the rocks by the cave
    { const a = [mx + 14, 0, mz + 20], b = [mx + 20, 0, mz + 25]; a[1] = topAt(a[0], a[2]) + 1; b[1] = topAt(b[0], b[2]) + 1;
      if (Number.isFinite(a[1]) && Number.isFinite(b[1])) fallenLog(g, a, b, { radius: 1.4, seed: 5, ferns: 1, fungi: 3 }); }
    for (const [x, z] of [[mx - 10, mz + 2], [mx + 8, mz + 1]]) plant(x, z, (p) => pitcherPlant(g, p, { count: 4, radius: 2, seed: x + z }));
  }

  // ---- the boardwalk + the platform at the mouth ----
  const deckTop = (x, z) => { const t = topAt(x, z); return Number.isFinite(t) ? t : LAKE_Y; };
  const deckY = my;
  const bw = boardwalk(g, trailPts, { topAt: deckTop, lift: 1, half: 1.5, endY: deckY, keepAbove: (id) => rockIds.has(id), headroom: 9 });
  {
    const [[ax, az], [bx2, bz2]] = platform;
    for (let x = ax; x <= bx2; x++) for (let z = az; z <= bz2; z++) {
      for (let y = deckY + 1; y <= deckY + 9; y++) if (!rockIds.has(g.get(x, y, z))) g.set(x, y, z, 0);
      g.set(x, deckY, z, hash3(x, 0, z, 41) < 0.25 ? P.id('plankLight') : P.id('plank'));
      const edgeX = x === ax || x === bx2, edgeZ = z === bz2;
      if ((edgeX || edgeZ) && !(x === bx2 && z >= bz2 - 3)) {
        const isPost = (edgeX && (z - az) % 3 === 0) || (edgeZ && (x - ax) % 3 === 0) || (edgeX && edgeZ);
        if (isPost) { const gt = deckTop(x, z); for (let y = Math.min(gt + 1, deckY); y <= deckY + 2; y++) g.set(x, y, z, M.post); }
        else g.set(x, deckY + 2, z, P.id('fiberRope'));
      }
      if ((x - ax) % 4 === 0 && (z - az) % 3 === 1) { const gt = deckTop(x, z); for (let y = gt + 1; y < deckY; y++) g.set(x, y, z, M.post); }
    }
    // lanterns on two posts at the cave entrance
    for (const x of [ax, bx2 - 1]) { for (let y = deckY + 1; y <= deckY + 5; y++) g.set(x, y, az, M.post); g.set(x, deckY + 6, az, P.id('lanternGlow')); g.set(x, deckY + 7, az, M.roofDark); }
  }

  // ---- inside the cave: a golden Buddha in a dark niche on the west wall, facing the entrance hall (+x); a
  // saffron-wrapped stalagmite; a guide; a hiker with a headlamp in the mouth — the grotto stays dark, warm points of light ----
  {
    const bp = [mx - 7, my, mz - 5];
    for (let x = bp[0] - 3; x <= bp[0] + 4; x++) for (let z = bp[2] - 5; z <= bp[2] + 5; z++) {
      for (let y = my; y <= my + 12; y++) if (g.get(x, y, z)) g.set(x, y, z, 0);
      g.set(x, my - 1, z, P.id('caveRock'));
    }
    buddha(g, bp, '+x', M);
    // a big stalagmite wrapped in saffron cloth, a candle + marigolds at its foot
    const sx = mx + 3, sz = mz - 6;
    for (let y = my - 1; y <= my + 5; y++) for (let dx = 0; dx <= (y < my + 3 ? 1 : 0); dx++) for (let dz = 0; dz <= (y < my + 3 ? 1 : 0); dz++) g.set(sx + dx, y, sz + dz, y === my + 2 ? M.saffron : P.id('stalactite'));
    g.set(sx, my + 6, sz, P.id('stalactite')); g.set(sx - 1, my, sz + 1, M.lamp); g.set(sx + 2, my, sz + 1, P.id('marigold'));
    // the guide, hands together before the Buddha; a hiker with a headlamp stepping into the mouth
    for (const [x, z] of [[mx - 1, mz - 6], [mx - 1, mz - 5], [mx + 5, mz - 3], [mx + 5, mz - 2], [mx + 4, mz - 3]]) { g.set(x, my - 1, z, P.id('caveRock')); for (let y = my; y <= my + 7; y++) g.set(x, y, z, 0); }
    person(g, [mx - 1, my, mz - 6], { side: '-x', pose: 'stand', shirt: P.id('ribbonGreen'), hat: P.id('thatchPalmLight'), seed: 4 });
    person(g, [mx + 5, my, mz - 3], { side: '-x', pose: 'stand', seed: 12 });   // by the east wall, headlamp on the Buddha
    g.set(mx + 4, my + 5, mz - 3, M.headlamp);
  }

  // the trail sign at the bottom of the boardwalk, by the landing
  { const sx = 22, sz = mz + 32, y = topAt(sx, sz); if (Number.isFinite(y)) batSign(g, [sx, y + 1, sz], '+z', M); }

  // ---- the lake landing: a short jetty + a moored long-tail boat nosed in beside it ----
  {
    const ly = LAKE_Y + 1;
    jetty(g, [26, ly, mz + 29], [33, ly, mz + 29], { width: 3, lamp: true, ladder: true, seed: 3 });
    longtail(g, [33, LAKE_Y, mz + 21], { dir: '+z', length: 13, canopy: true, passengers: 0, driver: 'sit', seed: 8 });
  }

  // ---- the shore: drowned dead trees in the shallows north of the landing ----
  const perches = [];
  for (const [x, z, h] of [[29, -110, 12], [33, -101, 8], [29, -94, 15]]) {
    if (!isLake(x, z)) continue;
    const t = deadTree(g, [x, LAKE_Y, z], { bed: lakeBedY(x, z), height: h, branches: 2, seed: x * 7 + z });
    if (t.perch[0] <= X1 - 1) perches.push(t.perch);
  }

  // ---- lianas hanging from the trees along the creek valley (where the camera can see them) ----
  {
    const near = (x, z) => { for (let dz = -9; dz <= 9; dz += 3) for (let dx = -9; dx <= 9; dx += 3) if (creekCells.has(`${x + dx},${z + dz}`)) return true; return false; };
    const anchors = forest.trees.filter((t) => near(t.base[0], t.base[2])).flatMap((t) => t.limbs.slice(0, 2)).filter(([x, , z]) => inBox(x, z)).slice(0, 26);
    lianas(g, anchors, { seed: 23, connect: 0.25, dangle: 0.3, ground: (x, z) => { const t = topAt(Math.round(x), Math.round(z)); return Number.isFinite(t) ? t + 1 : 1; } });
  }

  // ---- mist: a haze wisp in the saddle between the summits, haze lying low over the water by the drowned trees ----
  {
    // the saddle wisp is particle haze (a voxel cloud read as styrofoam from every orbit angle)
    ctx.emit('particles', { preset: 'mist', motion: 'drift', box: [[-24, 50, -116], [0, 57, -104]], count: 18, size: 14, sizeJitter: 0.3, opacity: 0.15, glow: 1, colors: ['#ffffff', '#f6efe4'], speed: 0.015, seed: 31 });
    ctx.emit('particles', { preset: 'mist', motion: 'drift', sizeJitter: 0.4, speed: 0.02, turbulence: 0.4, sway: 0, glow: 1.0, fade: 0.3, colors: ['#ffffff', '#f6efe4'],
      box: [[16, 1, -120], [46, 3, -80]], count: 30, size: 12, opacity: 0.11, seed: 7 });   // faint: the dead trunks stay dark silhouettes
  }

  // ---- understory over the forest floor (not on the trail / platform / cave apron) ----
  undergrowth(g, [X0, Z0], [X1, Z1], { on: FLOOR, density: 0.8, avoid: (x, z) => trailCells.has(`${x},${z}`) || (x >= platform[0][0] - 1 && x <= platform[1][0] + 1 && z >= platform[0][1] - 1 && z <= platform[1][1] + 1), seed: 55 });

  // ---- life ----------------------------------------------------------------------------------------------------
  // dawn: the colony streams home — an S-shaped ribbon of bats, wide and high over the lake shore, swinging left and
  // right as it drops, narrowing and thickening into the cave mouth (same spec as the towers' bats → one system; the
  // second emit packs more bats on the last stretch so the stream is densest at the mouth)
  const batPath = [
    [mx + 46, my + 86, mz + 10], [mx + 30, my + 78, mz + 22], [mx + 22, my + 68, mz + 14], [mx + 36, my + 56, mz + 16],
    [mx + 30, my + 44, mz + 6], [mx + 16, my + 36, mz + 10], [mx + 6, my + 30, mz + 7],
    // the last stretch drops steeply under the lip and into the dark vault above the Buddha's niche (seen from the
    // yaw-55 tour stops the bats stay above his head)
    [mx + 1, my + 24, mz + 4], [mx + 1, my + 19, mz], [mx - 1, my + 17, mz - 4]];
  const batSpec = { creature: 'bat', behavior: 'path', loop: 'restart', spread: [6, 0.4], wobble: 1 };
  ctx.emit('actors', { ...batSpec, count: 26, path: batPath });
  ctx.emit('actors', { ...batSpec, count: 8, path: batPath.slice(5) });
  // hikers walking the trail up to the cave and back down to the boat
  const walk = [[31, mz + 29.5], ...trailPts.slice(0, -1)];   // they turn back at the top of the stairs: the platform stays clear of the yaw-55 view of the Buddha
  ctx.emit('actors', { ...LIFE.walker, count: 4, behavior: 'path', path: [...walk, ...walk.slice(1, -1).reverse()] });
  // langurs on a mossy rock shelf on the cliff just east of the cave mouth (watching the hikers) + one on a high ledge
  {
    const sy = my + 11, lx0 = mx + 8, lx1 = mx + 13;
    let fz = -200;
    for (let x = lx0; x <= lx1; x++) for (let z = mz + 6; z > mz - 12; z--) if (rockIds.has(g.get(x, sy, z))) { fz = Math.max(fz, z); break; }
    if (fz > -200) for (let x = lx0 - 1; x <= lx1 + 1; x++) for (let z = fz - 2; z <= fz + 2; z++) {
      const edge = x === lx0 - 1 || x === lx1 + 1 || z === fz + 2;
      if (edge && hash3(x, sy, z, 91) < 0.5) continue;
      for (let y = sy - (z === fz + 2 ? 0 : 1); y <= sy; y++) if (!g.get(x, y, z) || leafIds.has(g.get(x, y, z))) g.set(x, y, z, y === sy ? P.id('karstMoss') : P.id('limestone'));
      for (let y = sy + 1; y <= sy + 4; y++) if (leafIds.has(g.get(x, y, z))) g.set(x, y, z, 0);
    }
    var shelf = fz > -200 ? [[lx0 + 0.5, sy + 1, fz + 2.2, 10], [lx0 + 4.5, sy + 1, fz + 1.8, -20]] : [];
  }
  const ledge = ridge.ledges.filter(([x, y, z]) => z >= -100 && y >= 25 && y <= 50 && !g.get(x, y, z) && !g.get(x, y + 1, z) && !g.get(x, y + 2, z) && rockIds.has(g.get(x, y - 1, z)))
    .sort((a, b) => b[2] - a[2]);
  const lspots = [];
  for (const [lx, ly, lz] of ledge.slice(0, 2)) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const x = lx + dx, z = lz + dz;
    if (lspots.length >= 1 || g.get(x, ly, z) || g.get(x, ly + 1, z) || g.get(x, ly + 2, z) || !rockIds.has(g.get(x, ly - 1, z))) continue;
    if (lspots.some((q) => Math.hypot(q[0] - x - 0.5, q[2] - z - 0.5) < 2.4)) continue;
    lspots.push([x + 0.5, ly, z + 0.5, [10, 60, -35][lspots.length]]);
  }
  lspots.push(...shelf);
  if (lspots.length) ctx.emit('actors', { ...LIFE.langur, spots: lspots });
  // a kingfisher hopping between the drowned trees
  if (perches.length >= 2) ctx.emit('actors', { ...LIFE.kingfisher, count: 1, spots: perches.map(([x, y, z]) => [x + 0.5, y + 1, z + 0.5]) });
  ctx.emit('actors', { ...LIFE.butterfly, count: 4, area: [[mx - 6, mz + 6], [mx + 20, mz + 30]] });

  // ---- points of interest (yaw 55: from the east the giant's tree-house and the strangler fig don't hide the mouth) ----
  ctx.emit('poi', { label: 'The bat cave', icon: '🦇', target: [mx, my + 10, mz], zoom: 5, yaw: 55 });
  ctx.emit('poi', { label: 'Golden Buddha & the langurs', icon: '🛕', target: [mx - 1, my + 7, mz - 3], zoom: 9, yaw: 55 });
  if (perches.length) ctx.emit('poi', { label: 'Drowned trees in morning mist', icon: '🌫️', target: [31, 6, -100], zoom: 5 });
}
