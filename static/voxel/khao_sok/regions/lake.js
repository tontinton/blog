// Lake (SE) — the front corner of Khao Sok: calm emerald Cheow Lan water; the slab's front/right walls are a glass
// cross-section into it (clear water near the outer walls: base.js lakeClear). Above: the sacred islet (a top-heavy
// limestone spire, a ribboned fig clinging to its top, a macaque eating figs, krathong offerings at its foot), a wild
// elephant swimming across the front water (voxel swimmer: head, ears awash, trunk snorkel, humped back, V-wake), one
// patch of drowned snags (egrets, a kingfisher, a darter drying its wings, lotus), turtles sunning on a floating log, a
// boy fishing from a moored sampan, a floating bamboo fish farm, far haze; one long-tail boat cruises a loop. Below,
// through the glass: the drowned village — a brick bell chedi whose gilt needle breaks the surface, old house posts, a
// sunken long-tail boat — a giant snakehead nosing the boy's bait, pale drowned trunks, weed clumps, fish traps, fish.
import { ground } from '../base.js';
import { KARSTS, LAKE_Y, LIFE, columnAt } from '../layout.js';
import { lilyPads, person, foliage, rng, hash3, clamp } from '../../lib/index.js';
import { underwater, drownedTree, CHEDI, BOAT } from './lake-under.js';

const W = LAKE_Y;                              // top water voxel (0)

// ---- the plan (x 40…119, z 40…119; +x / +z walls are the glass cutaway, x = 40 / z = 40 are seams) ----------------
const ISLET = KARSTS.find((k) => k.id === 'islet');
const [IX, , IZ] = ISLET.base;                 // 96, 92
// drowned trees breaking the surface: [x, z, height above water, trunk radius] — ONE patch of straight bleached snags
// between the islet and the west shore (their trunks run down to splayed roots on the bed, seen through the +z glass).
const SNAGS = [[60, 106, 15, 1.2], [53, 112, 9, 1.0], [67, 113, 6, 0.9], [70, 101, 7, 1.0], [55, 99, 4, 0.8]];
// two thick drowned trunks (tops just under the surface) cut by the glass right where the clear "glass" water steps
// back to the shared lake water (x ≈ 44 on the +z wall, z ≈ 44 on the +x wall): they hide that seam.
const DIVIDERS = [[44, 118, 1.6], [118, 44, 1.5]];
const FARM = { x0: 103, x1: 115, z0: 46, z1: 58 };              // floating fish farm frame (deck at y 1)
const BOAT_LOOP = [[62, 55], [78, 53], [88, 58], [84, 68], [72, 74], [62, 70], [56, 62]];   // clear of the raft village (z < 40)
// the swimming elephant (a static voxel swimmer, heading −x, side-on to the camera) between the islet and the chedi:
// [x, -, z, heading] of its middle; its head is at x − 8
const ELEPHANT = [96, 0, 104, 270];
// a boy fishing from a little moored sampan just inside the +z glass; his line drops through the cutaway to a bait that
// a giant snakehead is nosing beside the drowned chedi
const SAMPAN = [77, 110];                      // hull centre (along x)
const HOOK = [80, 116];                        // where the line drops (3 behind the +z glass)

export default function build(g, ctx) {
  ground(g, ctx);
  ctx.clip = true;
  const P = ctx.P, R = ctx.rng;
  materials(P);
  const bedY = (x, z) => columnAt(Math.round(x), Math.round(z)).bed;

  // ---- 1. under the water: bed, stumps/logs/rocks/weed, the drowned village, sunken boat, traps (lake-under.js) ----
  underwater(g, ctx, { bedY, hook: HOOK });

  // ---- 2. the islet: a slender, top-heavy limestone spire (Ko Tapu-like) with a deep waterline notch ----
  const islet = isletSpire(g, ctx, bedY);

  // ---- 3. the drowned forest: bleached snags breaking the surface, trunks down to their roots on the bed ----
  const snagTops = SNAGS.map(([x, z, h, r], i) => ({ ...drownedTree(g, [x, bedY(x, z), z], W + h, r, { seed: 7 + i * 13, branches: h >= 9 ? 1 : 0, lean: 0.02 }), h }));
  for (const [x, z, r] of DIVIDERS) drownedTree(g, [x, bedY(x, z), z], W - 1, r, { seed: x + z });

  // ---- 4. the floating fish farm ----
  const farm = fishFarm(g, R);

  // ---- 5. surface details: lotus among the snags, turtles on a floating log, a darter drying its wings ----
  lilyPads(g, [56, 108], [64, 116], { y: W, clusters: 1, flowers: 1, seed: 5 });
  turtleLog(g, [61, 80], [72, 83]);
  const dart = darter(g, snagTops[0].top);
  // offerings floating at the sacred islet's foot (banana-leaf krathongs with flowers, incense and a candle), a barb
  // leaping out of the water in a ring of ripples, the swimming elephant's wake
  krathong(g, [IX + 7, W + 1, IZ + 1]); krathong(g, [IX - 7, W + 1, IZ - 2]);
  leapingFish(g, [71, W + 1, 64]);
  swimmingElephant(g, ELEPHANT, bedY);
  elephantWake(g, ELEPHANT);
  sampanBoy(g, bedY);

  // ---- 6. morning haze lying low over the far water (toward the rafts and the towers: it thickens with distance) ----
  ctx.emit('particles', { preset: 'mist', motion: 'drift', count: 20, size: 14, sizeJitter: 0.35, opacity: 0.12, glow: 1, colors: ['#ffffff', '#f6efe4'], speed: 0.03, turbulence: 0.3, box: [[46, 1, 40], [116, 3, 70]], seed: 41 });

  // ---- 7. life ----
  emitLife(ctx, { islet, snagTops, farm });

  // ---- 8. points of interest (labels ≤ 32 chars) ----
  // framed so the slab's front-right corner stays outside the 1100×700 frame (no backdrop): subjects sit right of centre
  ctx.emit('poi', { label: 'The sacred islet', icon: '🐒', target: [90, 13, 89], zoom: 7 });
  ctx.emit('poi', { label: 'Drowned village (and a bite!)', icon: '🛕', target: [90, 3, 110], zoom: 5, yaw: 8, pitch: 16 });
  ctx.emit('poi', { label: 'An elephant swimming across', icon: '🐘', target: [91, 2, 101], zoom: 8 });
  ctx.emit('poi', { label: 'Darter drying its wings', icon: '🪶', target: dart, zoom: 9 });
}

// ------------------------------------------------------------------------------------------------------------------
function materials(P) {
  const add = (n, d) => { if (!P.has(n)) P.add(n, d); };
  add('lake_snag', { color: '#a9a59b', jitter: 0.05, noise: { color: '#96928a', scale: 0.35, amount: 0.5 } });   // weathered silver-grey
  add('lake_snagDark', { color: '#7e7a72', jitter: 0.05 });
  add('lake_sandDark', { colors: ['#bba982', '#b4a27c'], jitter: 0.04 });
  add('lake_post', { color: '#5e4a36', jitter: 0.06, noise: { color: '#4a5236', scale: 0.4, amount: 0.5 } });
  // foam / ripples: replace the top water voxel (flush with the surface), whiter in the middle of a wake
  add('lake_foam', { color: '#f4f8f6', jitter: 0.02, roughness: 0.5, emissive: 0.12 });
  add('lake_foamThin', { color: '#7dbcad', jitter: 0.03, roughness: 0.3 });
  add('lake_weed', { color: '#2e5628', jitter: 0.08, sway: 0.45 });
  add('lake_weedLight', { color: '#4e7c34', jitter: 0.07, sway: 0.5 });
  add('lake_weedRed', { color: '#8a5634', jitter: 0.07, sway: 0.4 });
  add('lake_algae', { color: '#5f7444', jitter: 0.08, noise: { color: '#4a5e36', scale: 0.3, amount: 0.6 } });
  add('lake_drownedWood', { color: '#b0ad9c', jitter: 0.06, noise: { color: '#7e8a68', scale: 0.25, amount: 0.6 } });
  add('lake_mud', { colors: ['#54493a', '#4e4436', '#5a4e3e'], jitter: 0.05 });
  add('lake_pebble', { colors: ['#9a958a', '#7e7a70', '#b0a898'], jitter: 0.05 });
  add('lake_shell', { color: '#e8e2d2', jitter: 0.04 });
  add('lake_net', { color: '#2e3430', jitter: 0.05 });
  add('lake_buoy', { color: '#f06a24', jitter: 0.03 });
  add('lake_brick', { color: '#c25a3c', jitter: 0.07, noise: { color: '#9a4a36', scale: 0.25, amount: 0.5 } });
  add('lake_brickAlgae', { color: '#7a7a4e', jitter: 0.07, noise: { color: '#5e6a40', scale: 0.3, amount: 0.6 } });
  add('lake_stucco', { color: '#fbf7ec', jitter: 0.03, noise: { color: '#e4dfcf', scale: 0.3, amount: 0.2 } });
  add('lake_gilt', { color: '#e0b440', jitter: 0.04, metalness: 0.5, roughness: 0.4, emissive: 0.25 });
  add('lake_sunkHull', { color: '#6e4c32', jitter: 0.07, noise: { color: '#5a5a3a', scale: 0.3, amount: 0.5 } });
  add('lake_sunkPaint', { color: '#3f9ad8', jitter: 0.05, noise: { color: '#5a8a80', scale: 0.3, amount: 0.25 } });
  add('lake_bubble', { color: '#e8f8f4', jitter: 0.02, roughness: 0.2, emissive: 0.4 });
  add('lake_rust', { color: '#8a4e30', jitter: 0.08 });
  add('lake_turtle', { color: '#3e3c2a', jitter: 0.06, noise: { color: '#5a5634', scale: 0.6, amount: 0.6 } });
  add('lake_turtleSkin', { color: '#6a6a40', jitter: 0.05 });
  add('lake_turtleStripe', { color: '#d8b84a', jitter: 0.04 });
  add('lake_darter', { color: '#1e1e22', jitter: 0.05 });
  add('lake_darterNeck', { color: '#8a6a48', jitter: 0.04 });
  add('lake_darterWing', { color: '#3a3a3e', jitter: 0.06 });
  add('lake_darterStreak', { color: '#c8c8c0', jitter: 0.04 });
  add('lake_bill', { color: '#d8b050', jitter: 0.03 });
  add('lake_candle', { color: '#fff4dc', emissive: 1.5, emissiveColor: '#ffc070' });
  add('lake_barb', { color: '#dfe6e2', jitter: 0.03, metalness: 0.35, roughness: 0.3 });
  add('lake_barbFin', { color: '#e0663a', jitter: 0.03 });
  add('lake_ele', { color: '#8d939c', jitter: 0.05, noise: { color: '#7d828a', scale: 0.4, amount: 0.5 } });   // the river elephants' wet slate
  add('lake_eleDark', { color: '#6f747c', jitter: 0.04 });
  add('lake_eleEye', { color: '#1a1a1e', roughness: 0.2 });
  add('lake_elePink', { color: '#c49a94', jitter: 0.04 });
  add('lake_eleTip', { color: '#b4a4a2', jitter: 0.03 });
  add('lake_line', { color: '#3a3a3a', jitter: 0.02 });
  add('lake_hook', { color: '#b8bcc0', metalness: 0.6, roughness: 0.35 });
  add('lake_bait', { color: '#b0605a', jitter: 0.04 });
  add('lake_snakehead', { color: '#3b4a32', jitter: 0.05 });
  add('lake_snakeheadMid', { color: '#56603f', jitter: 0.06, noise: { color: '#2e3a28', scale: 0.6, amount: 0.7 } });
  add('lake_snakeheadBelly', { color: '#c9c3a6', jitter: 0.04 });
  add('lake_snakeheadEye', { color: '#d0302a', emissive: 0.3 });
  add('lake_bucket', { color: '#3a8ad0', jitter: 0.03 });
  add('lake_feed', { color: '#c89a5a', jitter: 0.05 });
}

/** The islet: a leaning, top-heavy limestone spire with a deep wet notch at the waterline (Ko Tapu-like), fluted
 *  and streaked cliffs, jungle tufts and vine curtains on the top, and its single tree: a gnarled fig clinging to the
 *  summit, roots draped down the cliff, trunk wrapped in sacred cloth ribbons. Returns anchors. */
function isletSpire(g, ctx, bedY) {
  const N = ctx.noise, R = rng(ISLET.seed);
  const T = 19;                                                          // summit height above the water
  const lean = [-2.6, 1.2];                                              // top offset (toward −x: screen left)
  const ctr = (y) => { const t = clamp(y / T, 0, 1) ** 1.6; return [IX + lean[0] * t, IZ + lean[1] * t]; };
  const rad = (y) => {
    if (y <= -6) return 5.6;
    if (y <= -2) return 5.6 - ((y + 6) / 4) * 1.5;                       // foot → notch
    if (y <= 2) return 3.1 + Math.abs(y) * 0.45;                         // the notch (undercut)
    if (y <= 12) return 4.0 + ((y - 2) / 10) * 1.9;                      // top-heavy
    return 5.9 * Math.sqrt(Math.max(0, 1 - ((y - 12) / (T - 10)) ** 2)); // rounded cap
  };
  const rot = 0.45, ca = Math.cos(rot), sa = Math.sin(rot);
  const inside = (x, y, z) => {
    const [cx, cz] = ctr(y), dx = x - cx, dz = z - cz, u = dx * ca + dz * sa, v = -dx * sa + dz * ca;
    const ang = Math.atan2(v, u), fl = 1 + 0.08 * N.simplex3(Math.cos(ang) * 1.6, Math.sin(ang) * 1.6, y * 0.06) + 0.03 * N.simplex3(Math.cos(ang) * 4, Math.sin(ang) * 4, y * 0.12 + 5);
    const r = rad(y) * fl, a = r * 1.08, b = r * 0.86;
    return (Math.abs(u / a) ** 2.6 + Math.abs(v / b) ** 2.6) ** (1 / 2.6) <= 1;
  };
  const by = Math.min(...[[-6, 0], [6, 0], [0, -6], [0, 6], [0, 0]].map(([dx, dz]) => bedY(IX + dx, IZ + dz)));
  const solid = new Set(), key = (x, y, z) => (x * 4096 + z) * 256 + y + 64;
  for (let y = by; y <= T; y++) for (let x = IX - 10; x <= IX + 10; x++) for (let z = IZ - 10; z <= IZ + 10; z++) {
    if (!inside(x + 0.5 - 0.5, y, z) || (y <= bedY(x, z))) continue;
    solid.add(key(x, y, z));
  }
  const has = (x, y, z) => solid.has(key(x, y, z));
  for (let y = by; y <= T; y++) for (let x = IX - 10; x <= IX + 10; x++) for (let z = IZ - 10; z <= IZ + 10; z++) {
    if (!has(x, y, z)) continue;
    const [cx, cz] = ctr(y), ang = Math.atan2(z - cz, x - cx), h = hash3(x, y, z, 41);
    let m;
    if (!has(x, y + 1, z) && y >= 3) m = h < 0.7 ? 'karstMoss' : 'limestoneLight';
    else if (y <= -2) m = h < 0.3 ? 'lake_algae' : 'limestoneDark';
    else if (y <= 1) m = h < 0.15 ? 'limestoneDark' : 'limestoneNotch';
    else {
      // rain streaks: thin vertical runs keyed by column, from under the cap down a random length; iron-orange stains
      const hs = hash3(x, 0, z, 47), y0s = T - 2 - Math.floor(hash3(x, 1, z, 47) * 5), len = 4 + Math.floor(hash3(x, 2, z, 47) * 11);
      const streak = hs < 0.2 && y <= y0s && y > y0s - len;
      const rust = N.simplex3(x * 0.3, y * 0.12, z * 0.3) > 0.5 && y > 5;
      m = streak ? (h < 0.35 ? 'limestoneStreak' : 'limestoneDark') : rust ? 'limestoneOrange' : y >= T - 4 && h < 0.4 ? 'limestoneLight' : h < 0.12 ? 'limestoneDark' : 'limestone';
      if (y === 2 && h < 0.5) m = 'limestoneNotch';
      if (y === 2 && !has(x, 1, z) && h < 0.4) g.set(x, 1, z, 'stalactite');   // drips under the notch overhang
    }
    g.set(x, y, z, m);
  }
  // jungle tufts on the summit + vine curtains over the rim
  const leaves = ['jungleLeafDark', 'jungleLeaf', 'jungleLeafLight', 'jungleLeafSun'];
  const [tx, tz] = ctr(T);
  const rim = [];
  for (let x = IX - 10; x <= IX + 10; x++) for (let z = IZ - 10; z <= IZ + 10; z++) {
    let top = null;
    for (let y = T; y >= 8; y--) if (has(x, y, z)) { top = y; break; }
    if (top == null) continue;
    let edge = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!has(x + dx, top, z + dz)) edge++;
    if (edge) rim.push([x, top, z, edge]);
  }
  for (const [x, top, z] of rim) {
    if (hash3(x, top, z, 43) < 0.22) foliage(g, [{ c: [x, top + 1, z], r: R.range(1, 1.7) }], { leaves, squash: 0.7, roughness: 0.3, seed: x * 7 + z, mode: 'keep' });
    if (hash3(x, top, z, 44) < 0.16) {                                   // vine strand down the cliff
      const [cx, cz] = ctr(top), dx = Math.sign(Math.round(x - cx)), dz = Math.sign(Math.round(z - cz));
      const L = 2 + Math.floor(hash3(x, 0, z, 45) * 6);
      for (let i = 0; i < L; i++) { const y = top - i, px = x + dx, pz = z + dz; if (g.get(px, y, pz) || y < 3) break; if (!has(px - dx, y, pz - dz) && !has(px, y, pz - dz) && !has(px - dx, y, pz)) break; g.set(px, y, pz, i === L - 1 ? 'jungleLeafLight' : hash3(px, y, pz, 46) < 0.5 ? 'jungleLeafDark' : 'jungleLeaf'); }
    }
  }
  // the tree: root near the summit's back, trunk climbing then leaning out over the overhang
  const rx = Math.round(tx + 0.5), rz = Math.round(tz - 1.5), ry = T + 1;
  const pts = [[rx, ry, rz], [rx - 0.8, ry + 2, rz - 0.2], [rx - 2, ry + 3.6, rz - 0.6], [rx - 3.4, ry + 4.4, rz - 1]];
  g.tube(pts, 'figRoot', { r: 1.15, r2: 0.6 });
  g.tube([[rx - 0.6, ry + 2.2, rz - 0.2], [rx + 1.2, ry + 3.6, rz - 1.2], [rx + 2.6, ry + 4.2, rz - 2.4]], 'figRoot', { r: 0.6, r2: 0.5 });
  // clinging roots draped over the rim and down the cliff
  for (const [dx, dz, L] of [[3, 2, 7], [-2, 4, 9], [4, -2, 6], [-4, -2, 8]]) {
    const a = [rx, ry, rz], b = [rx + dx, ry - 0.5, rz + dz], c = [rx + dx * 1.35, ry - L, rz + dz * 1.35];
    g.tube([a, b, c], 'figRootDark', { r: 0.5 });
  }
  // ribbons round the trunk + a marigold garland on the roots
  [['ribbonRed', 1], ['ribbonYellow', 2], ['ribbonPink', 3]].forEach(([m, i]) => {
    const t = i / 3, cx = rx - 1 * t, cz = rz + 0.5 * t, y = ry + i;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = Math.round(cx + dx), z = Math.round(cz + dz); if (!g.get(x, y, z)) g.set(x, y, z, m); }
  });
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1]]) if (!g.get(rx + dx, ry, rz + dz)) g.set(rx + dx, ry, rz + dz, 'marigold');
  // umbrella crown over the leaning side
  const top = pts[3], blobs = [{ c: [top[0], top[1] + 1, top[2]], r: 3.7 }, { c: [rx + 2.6, ry + 5, rz - 2.6], r: 2.8 }, { c: [rx - 0.8, ry + 5.2, rz - 1], r: 2.8 }];
  for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.3; blobs.push({ c: [top[0] + 0.5 + Math.cos(a) * 3.3, top[1] + R.range(-0.4, 0.6), top[2] + Math.sin(a) * 3.1], r: R.range(2.2, 2.9) }); }
  foliage(g, blobs, { leaves, squash: 0.5, roughness: 0.3, speckle: 0.12, seed: 4, mode: 'keep' });
  // the macaque sits on the summit rim on the camera side, under the crown's edge
  const mx = Math.round(tx + 2), mz = Math.round(tz + 2.5);
  let my = T; while (my > 8 && !has(mx, my, mz)) my--;
  const leafIds = new Set(leaves.map((m) => ctx.P.id(m)));
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = my + 1; y <= my + 4; y++) if (leafIds.has(g.get(mx + dx, y, mz + dz))) g.set(mx + dx, y, mz + dz, 0);
  // its breakfast: figs fallen from the sacred tree
  for (const [dx, dz, m] of [[1, 0, 'figFruit'], [1, -1, 'figFruit'], [-1, 1, 'figFruit']]) { const x = mx + dx, z = mz + dz; let y = my; while (y > 8 && !has(x, y, z)) y--; if (has(x, y, z) && !g.get(x, y + 1, z)) g.set(x, y + 1, z, m); }
  return { top: [rx, ry, rz], macaque: [mx + 0.5, my + 1, mz + 0.5, 50], crown: [top[0], top[1] + 4, top[2]] };
}

/** Floating bamboo fish farm: a walkway frame on blue floats around two net cages hanging into the water, a little
 *  thatched shelter, a fisherman with a rod, a feed bucket. */
function fishFarm(g, R) {
  const { x0, x1, z0, z1 } = FARM, xm = Math.round((x0 + x1) / 2), y = W + 1;
  const deck = (x, z) => x === x0 || x === x1 || x === xm || z === z0 || z === z1;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if (!deck(x, z)) continue;
    g.set(x, y, z, (x + z) % 5 === 0 ? 'bambooPoleDark' : 'bambooPole');
    if ((x === x0 || x === x1 || x === xm) && z % 3 === 0) g.set(x, W, z, 'raftFloat');        // blue barrels
    else if ((z === z0 || z === z1) && x % 3 === 0) g.set(x, W, z, 'raftFloat');
    else g.set(x, W, z, 'bambooPoleDark');                                                      // bamboo bundle
  }
  // corner posts with a rail
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [xm, z0], [xm, z1]]) g.box([x, y + 1, z], [x, y + 2, z], 'bambooPoleDark');
  // net cages: walls of mesh from the surface down 6, a mesh floor
  const cages = [[x0 + 1, xm - 1], [xm + 1, x1 - 1]], cageY = W - 6;
  for (const [ca, cb] of cages) for (let x = ca; x <= cb; x++) for (let z = z0 + 1; z <= z1 - 1; z++) for (let yy = cageY; yy <= W; yy++) {
    const wall = x === ca || x === cb || z === z0 + 1 || z === z1 - 1, floor = yy === cageY;
    if (!wall && !floor) continue;
    if (yy === W && wall) { g.set(x, yy, z, 'lake_net'); continue; }                            // rim at the surface
    if ((x + yy + z) % 2 === 0) g.set(x, yy, z, 'lake_net');
  }
  // shelter on the north (−z) end: a widened deck with a lean-to thatch roof
  for (let x = x1 - 4; x <= x1; x++) for (let z = z0 - 3; z < z0; z++) { g.set(x, y, z, 'bambooPole'); g.set(x, W, z, x % 2 ? 'raftFloat' : 'bambooPoleDark'); }
  for (const [x, z] of [[x1 - 4, z0 - 3], [x1, z0 - 3], [x1 - 4, z0], [x1, z0]]) g.box([x, y + 1, z], [x, y + (z < z0 ? 5 : 4), z], 'bambooPoleDark');
  for (let x = x1 - 5; x <= x1 + 1; x++) for (let z = z0 - 4; z <= z0 + 1; z++) g.set(x, y + 6 - (z >= z0 ? 1 : 0) - (z === z0 + 1 ? 1 : 0), z, (x + z) % 3 ? 'thatchPalm' : 'thatchPalmLight');
  // gear under the shelter: a coiled net, buckets, a feed sack
  g.box([x1 - 3, y + 1, z0 - 2], [x1 - 2, y + 1, z0 - 2], 'lake_net'); g.set(x1 - 3, y + 2, z0 - 2, 'lake_net');
  g.set(x1 - 1, y + 1, z0 - 2, 'lake_bucket'); g.set(x1, y + 1, z0 - 1, 'lake_bucket');
  g.box([x1 - 4, y + 1, z0 - 1], [x1 - 4, y + 2, z0 - 1], 'bambooMat');
  // the fisherman sits on the middle walkway, rod out over the south cage edge
  person(g, [xm - 1, y + 1, z1 - 3], { side: '+z', pose: 'sit', seed: 12, hat: 'thatchPalmLight', shirt: 'ribbonGreen' });
  g.line([xm + 1, y + 2, z1 - 2], [xm + 2, y + 4, z1 + 3], 'bambooPoleDark');                 // the rod out over the water
  g.set(xm + 2, W + 1, z1 + 5, 'lake_buoy');                                                       // its float
  // a second worker on the west walkway throwing feed into the cage
  person(g, [x0, y + 1, z0 + 5], { side: '+x', pose: 'wave', seed: 21 });
  g.set(x0 + 1, y + 1, z0 + 3, 'lake_bucket'); g.set(x0 + 1, y + 2, z0 + 3, 'lake_feed');
  return { posts: [[x0, y + 3, z0], [x1, y + 3, z1], [x0, y + 3, z1], [xm, y + 3, z0]], roof: [x1 - 2, y + 7, z0 - 2], cages: cages.map(([a, b]) => [(a + b) / 2, (z0 + z1) / 2]), feed: [x0 + 3, W, z0 + 5] };
}

/** A pale floating log with pond turtles hauled out on it, sunning in a row, heads raised toward the morning sun (+x).
 *  a, b: [x, z] ends. */
function turtleLog(g, a, b) {
  g.tube([[a[0], W + 0.6, a[1]], [(a[0] + b[0]) / 2, W + 0.75, (a[1] + b[1]) / 2], [b[0], W + 0.5, b[1]]], (x, y, z) => (y <= W ? 'deadWoodWet' : hash3(x, y, z, 5) < 0.18 ? 'lake_snagDark' : 'lake_snag'), { r: 1.3, r2: 1.05 });
  g.line([a[0] + 2, W + 2, a[1]], [a[0] + 1, W + 4, a[1] - 2], 'lake_snag');            // a broken branch stub
  const turtle = (x, y, z, small) => {
    const x0 = small ? x : x - 1;
    g.box([x0, y, z], [x + 1, y, z + 1], 'lake_turtleSkin');                               // the lighter rim
    g.box([x0, y + 1, z], [x + 1, y + 1, z + 1], 'lake_turtle');                           // 3×2 shell (2×2: the young one)
    if (!small) g.set(x, y + 2, z, 'lake_turtle');                                           // dome
    g.set(x + 2, y, z, 'lake_turtleSkin'); g.set(x + 3, y + 1, z, 'lake_turtleStripe');     // neck + raised, striped head
    g.set(x - 2, y, z + 1, 'lake_turtleSkin');                                               // tail
  };
  const at = (t) => { const x = Math.round(a[0] + (b[0] - a[0]) * t), z = Math.round(a[1] + (b[1] - a[1]) * t); return [x, g.top(x, z) + 1, z]; };
  [[0.12], [0.5], [0.88, true]].forEach(([t, small]) => turtle(...at(t), small));
}

/** Oriental darter (snakebird) perched on a snag top facing the camera, wings held out level to dry in a shallow W
 *  (a silver flash along the inner wing), the kinked snake-neck and dagger bill turned to profile. → its centre. */
function darter(g, top) {
  const [x, yt, z] = top, y = yt + 1;
  g.box([x, y, z], [x, y + 3, z], 'lake_darter');                                         // body, upright
  g.set(x, y, z - 1, 'lake_darter'); g.set(x, y - 1, z - 1, 'lake_darter');               // tail fanned down the snag
  const edge = [3, 2, 2, 3, 3, 4];                                                         // upper edge (+y) per span voxel: a shallow W
  for (const s of [-1, 1]) edge.forEach((e, i) => {
    g.set(x + s * (i + 1), y + e, z, i >= 1 && i <= 3 ? 'lake_darterStreak' : i < 5 ? 'lake_darterWing' : 'lake_darter');   // a silver flash on the inner wing
    if (i < 5) g.set(x + s * (i + 1), y + e - 1, z, i === 0 ? 'lake_darter' : 'lake_darterWing');
  });
  for (const [dx, dy] of [[0, 4], [-1, 5], [-1, 6], [0, 7]]) g.set(x + dx, y + dy, z, 'lake_darterNeck');   // the kinked S
  g.set(x + 1, y + 7, z, 'lake_darter');                                                   // head, in profile
  g.set(x + 2, y + 7, z, 'lake_bill'); g.set(x + 3, y + 7, z, 'lake_bill');                // dagger bill
  return [x, y + 4, z];
}

/** A krathong: a little banana-leaf float folded like a lotus, marigolds and an orchid, a candle and incense. */
function krathong(g, [x, y, z]) {
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) g.set(x + dx, y, z + dz, dx && dz ? 'bananaLeafDark' : 'bananaLeaf');
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.set(x + dx, y + 1, z + dz, (dx + dz + 2) % 2 ? 'marigold' : 'lotus');
  g.set(x, y + 1, z, 'lotusLight'); g.set(x, y + 2, z, 'lake_candle');
  g.set(x + 1, y + 2, z + 1, 'incense'); g.set(x + 1, y + 3, z + 1, 'incenseTip');
}

/** A silver barb caught mid-leap in an arc over two rings of ripples (foam replacing the surface voxel, flush). */
function leapingFish(g, [x, y, z]) {
  const P = g.palette;
  for (let px = x - 4; px <= x + 4; px++) for (let pz = z - 4; pz <= z + 4; pz++) {
    const d = Math.hypot(px - x, pz - z), id = g.get(px, W, pz);
    if (!id || !P.isTransparent(id) || hash3(px, 3, pz, 71) < 0.2) continue;
    if (Math.abs(d - 1.5) < 0.5) g.set(px, W, pz, 'lake_foam');
    else if (Math.abs(d - 3.4) < 0.5) g.set(px, W, pz, 'lake_foamThin');
  }
  g.set(x - 1, y, z, 'lake_barbFin');                                                       // tail flicking off the water
  for (const [dx, dy] of [[0, 1], [1, 2], [2, 2], [3, 1]]) g.set(x + dx, y + dy, z, 'lake_barb');   // the arc
  g.set(x + 1, y + 3, z, 'lake_barbFin');                                                   // dorsal fin
  g.set(x - 1, y + 2, z, 'lake_bubble'); g.set(x + 4, y + 2, z + 1, 'lake_bubble');         // flung droplets
}

/** The wild elephant swimming across, as voxels (a still actor only shows a flat back): heading −x. Above the water a
 *  domed head with twin bumps and an eye, flat ears half awash (dark rims, pink speckles), the trunk up as a snorkel
 *  curling forward with a pale tip, a strip of water, then the two-humped back ridge whose end is awash; below, the
 *  body and legs mid-stride, dim through the water and the +z glass. e = [x, -, z, heading] (its middle). */
function swimmingElephant(g, [ex, , ez], bedY) {
  const P = g.palette, wet = (x, y, z) => { const id = g.get(x, y, z); return !id || P.isTransparent(id); };
  const put = (x, y, z, m) => { if (wet(x, y, z)) g.set(x, y, z, m); };
  const hx = ex - 8;                                                       // forehead front (x 88)
  const skin = (x, y, z) => (((y + 9) % 3 === 0 && hash3(x, y, z, 81) < 0.6) || hash3(x, y, z, 82) < 0.08 ? 'lake_eleDark' : 'lake_ele');   // creases
  // underwater: body, head, legs mid-stride
  for (let x = hx; x <= ex + 10; x++) for (let y = -8; y <= W - 1; y++) for (let z = ez - 4; z <= ez + 4; z++) {
    const body = ((x - (ex + 1.5)) / 8.6) ** 2 + ((y + 3.4) / 4) ** 2 + ((z - ez) / 3.7) ** 2 <= 1;
    const head = ((x - (hx + 1.5)) / 2.6) ** 2 + ((y + 0.8) / 2.6) ** 2 + ((z - ez) / 2.6) ** 2 <= 1;
    if (body || head) put(x, y, z, skin(x, y, z));
  }
  for (const [lx, lz, sw] of [[hx + 2.5, ez - 2, -2], [hx + 2.5, ez + 2, 1.5], [ex + 6, ez - 2, 1.5], [ex + 6, ez + 2, -2]]) {
    const foot = [lx + sw, bedY(Math.round(lx + sw), Math.round(lz)) + 1.5, lz];
    g.line([lx, -4, lz], [lx + sw * 0.5, -6.5, lz], 'lake_ele', { r: 1.1 });
    g.line([lx + sw * 0.5, -6.5, lz], foot, 'lake_ele', { r: 1 });
  }
  // the head well out of the water: a dome 4 long × 5 wide, twin bumps on top (the highest point), an eye each side
  for (let x = hx; x <= hx + 3; x++) for (let z = ez - 2; z <= ez + 2; z++) {
    put(x, W, z, skin(x, W, z)); put(x, W + 1, z, skin(x, W + 1, z));
    if (!(x === hx && Math.abs(z - ez) === 2)) put(x, W + 2, z, skin(x, W + 2, z));
    if (Math.abs(z - ez) <= 1 || (x > hx && x < hx + 3)) put(x, W + 3, z, 'lake_ele');
  }
  for (const dz of [-1, 1]) for (const x of [hx + 1, hx + 2]) put(x, W + 4, ez + dz, 'lake_ele');   // the twin domes
  g.set(hx + 1, W + 3, ez + 2, 'lake_eleEye'); g.set(hx + 1, W + 3, ez - 2, 'lake_eleEye');
  // the trunk snorkel, 2 thick: out of the forehead, straight up past the domes, hooked forward at the top, the pale
  // pink-grey tip curling down (it reads from the default far view)
  put(hx - 1, W + 1, ez, 'lake_ele'); put(hx - 1, W + 2, ez, 'lake_ele');
  for (let y = W + 1; y <= W + 6; y++) for (const x of [hx - 2, hx - 1]) put(x, y, ez, y === W + 3 || y === W + 5 ? 'lake_eleDark' : 'lake_ele');
  for (const x of [hx - 3, hx - 2, hx - 1]) put(x, W + 7, ez, 'lake_ele');
  put(hx - 4, W + 7, ez, 'lake_eleTip'); put(hx - 4, W + 6, ez, 'lake_eleTip');
  // the ears: flat 3×3 plates either side behind the head, tilted so their outer half is awash; dark rims, pink speckles
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const x = hx + 3 + i, z = ez + s * (3 + j), rim = i === 2 || j === 2, y = j === 0 ? W + 1 : W;
    g.set(x, y, z, rim ? 'lake_eleDark' : hash3(x, 9, z, 83) < 0.3 ? 'lake_elePink' : 'lake_ele');
  }
  // the back: a two-humped ridge proud of the water ~6 behind the head (water between), its end awash
  for (let x = ex; x <= ex + 6; x++) for (let z = ez - 2; z <= ez + 2; z++) {
    const end = x === ex || x === ex + 6;
    if (end && Math.abs(z - ez) === 2) continue;
    g.set(x, W, z, skin(x, W, z));
    if (Math.abs(z - ez) <= 1 || !end) put(x, W + 1, z, skin(x, W + 1, z));
  }
  for (const x of [ex + 1, ex + 2, ex + 4, ex + 5]) for (let z = ez - 1; z <= ez + 1; z++) if (!(x === ex + 1 || x === ex + 5) || z === ez) put(x, W + 2, z, 'lake_ele');   // two humps
  for (let x = ex + 7; x <= ex + 8; x++) for (let z = ez - 1; z <= ez + 1; z++) g.set(x, W, z, 'lake_ele');        // the rump, awash
}

/** A boy fishing from a little moored sampan: the rod reaches toward the glass and the line drops straight through the
 *  surface and the clear water to a baited hook 3 above the bed (where the snakehead noses it, see lake-under.js). */
function sampanBoy(g, bedY) {
  const [cx, cz] = SAMPAN, L = 4;                                         // hull x cx − 4 … cx + 4, z cz − 1 … cz + 1
  for (let x = cx - L; x <= cx + L; x++) {
    const tip = Math.abs(x - cx) === L, w = tip ? 0 : 1;
    for (let z = cz - w; z <= cz + w; z++) {
      g.set(x, W, z, 'longtailHullDark');                                   // the bottom, sitting in the water
      if (Math.abs(z - cz) === w || tip) g.set(x, W + 1, z, 'longtailHull');   // the gunwale
    }
    if (tip) g.set(x, W + 2, cz, 'longtailHull');                          // up-swept ends
  }
  g.box([cx - 1, W + 1, cz], [cx, W + 1, cz], 'plankLight');               // the seat thwart
  // moored to a bamboo pole by the bow
  g.box([cx - L - 2, bedY(cx - L - 2, cz) + 1, cz], [cx - L - 2, W + 3, cz], 'bambooPoleDark');
  g.line([cx - L, W + 2, cz], [cx - L - 2, W + 3, cz], 'fiberRope');
  // the boy on the thwart, facing the glass, holding his rod out over it; his catch bucket
  person(g, [cx - 1, W + 1, cz], { side: '+z', pose: 'sit', seed: 31, shirt: 'kayakYellow', pants: 'raftFloatDark', hat: 'thatchPalmLight' });
  const [lx, lz] = HOOK, ty = W + 5;
  g.line([cx, W + 3, cz + 1], [lx, ty, lz], 'bambooPole');                 // the rod
  for (let y = ty - 1; y >= bedY(lx, lz) + 4; y--) g.set(lx, y, lz, 'lake_line');   // the line, straight down
  g.set(cx + 2, W + 1, cz - 1, 'lake_bucket');
}

function emitLife(ctx, { islet, snagTops, farm }) {
  const E = (o) => ctx.emit('actors', o);
  // the long-tail boat cruising a loop across the open water in the back
  E({ creature: 'longtailBoat', on: 'water', behavior: 'path', path: BOAT_LOOP, count: 1, options: { canopy: true, passengers: 3 }, seed: 3 });
  // the macaque on the sacred islet
  E({ ...LIFE.macaque, spots: [islet.macaque], seed: 7 });
  // egrets hopping between the tall snags' perches; kingfishers on the low perches and the farm posts
  const perches = snagTops.filter((s) => s.h >= 7).map((s) => [s.perch[0] + 0.5, s.perch[1] + 1, s.perch[2] + 0.5]);
  E({ ...LIFE.egret, spots: perches, count: 2, seed: 9 });
  const low = [...farm.posts.map(([x, y, z]) => [x + 0.5, y, z + 0.5]), ...snagTops.filter((s) => s.h < 7).map((s) => [s.top[0] + 0.5, s.top[1] + 1, s.top[2] + 0.5])];
  E({ ...LIFE.kingfisher, spots: low, count: 2, seed: 11 });
  // dragonflies over the lotus
  E({ ...LIFE.dragonfly, area: [[50, 100], [64, 114]], count: 3, seed: 15 });
  // fish schooling (3D paths, y exact: the rig sits ~1.8 below its path) through the drowned trees, round the chedi,
  // over the sunken boat, by the traps, in the farm cages; and the shared fish just under the surface in the open water
  const [cx, cz] = CHEDI, [bx, bz] = BOAT;
  for (const [pts, count] of [
    [[[50, -3, 113], [58, -4, 117], [66, -3, 115.5], [73, -4, 112], [68, -5, 107], [58, -3, 109]], 6],
    [[[cx - 7, -4, cz - 2], [cx - 2, -3, cz - 6], [cx + 5, -4, cz - 4], [cx + 6, -5, cz + 1], [cx - 1, -4, cz + 2.5]], 4],
    [[[bx - 9, -6, bz - 3], [bx - 1, -5, bz - 4], [bx + 8, -6, bz - 2], [bx + 3, -7, bz + 2.5], [bx - 7, -7, bz + 2]], 4],
    [[[110, -4, 64], [116, -5, 70], [115, -3, 80], [110, -4, 74]], 3],
    [[[FARM.x0 + 2, 0.9, FARM.z0 + 3], [FARM.x0 + 4, 0.7, FARM.z0 + 6], [FARM.x0 + 2.5, 0.9, FARM.z1 - 3]], 3],
    [[[FARM.x1 - 4, 0.9, FARM.z0 + 3], [FARM.x1 - 2, 0.7, FARM.z0 + 6], [FARM.x1 - 3.5, 0.9, FARM.z1 - 3]], 3],
  ]) E({ ...LIFE.fish, behavior: 'path', path: pts, count });
  E({ ...LIFE.fish, count: 4, area: [[50, 60], [90, 84]] });
}

/** The swimming elephant's wake, carved into the surface (foam replaces the top water voxel): a bow wave at its head,
 *  a ring of churned water round its back, a V of foam spreading behind it, turbulence behind the tail. e = [x, y, z, heading]. */
function elephantWake(g, [ex, , ez, hd]) {
  const P = g.palette, a = (hd * Math.PI) / 180, fx = Math.sin(a), fz = Math.cos(a);   // heading 0 = +z, 90 = +x
  for (let x = Math.floor(ex - 30); x <= ex + 30; x++) for (let z = Math.floor(ez - 30); z <= ez + 30; z++) {
    const id = g.get(x, W, z);
    if (!id || !P.isTransparent(id)) continue;
    const dx = x - ex, dz = z - ez, u = -(dx * fx + dz * fz), v = dx * -fz + dz * fx;   // u: behind the centre, v: across
    const h = hash3(x, 7, z, 51), av = Math.abs(v);
    let m = null;
    // a clean white V: its vertex just ahead of the trunk, two arms widening behind (under the head and ears they're
    // hidden), unbroken near the elephant, thinning and breaking up far behind; a bright bow wave at the head
    const tip = -11.5, arm = (u - tip) * 0.42, d = Math.abs(av - arm), far = (u - tip) / 34;
    if (u >= tip - 0.5 && u <= -8.5 && av <= arm + 1.3) m = 'lake_foam';                               // bow wave
    else if (u > -8.5 && u <= 22 && d < 1.15 - far * 0.55 && h > far * far * 0.8) m = far < 0.7 ? 'lake_foam' : 'lake_foamThin';
    if (m) g.set(x, W, z, m);
  }
}
