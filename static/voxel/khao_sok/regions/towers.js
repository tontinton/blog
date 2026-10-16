// towers (NE) — the Three Brothers: three sheer, slim, jungle-capped limestone towers rising out of Cheow Lan lake.
// Stories: a sea cave kayakers paddle into (brother1) beside a floating spirit-house raft where a macaque makes off with
// the spirit's red soda while the boatman prays (brother2), swiftlet-nest collectors on a bamboo ladder up to a high cave
// the swiftlets stream into (brother3), a drowned forest of bleached snags with kingfishers (west), a fisherman in a
// sampan paying out a gill net on a line of bottle floats, a long-tail tour boat, Brahminy kites wheeling over the
// summits, and soft haze lying at the towers' feet.
import { karst, karstIslet, cave, stalactites, deadTree, kayak, spiritHouse, person, rock, foliage, hash3 } from '../../lib/index.js';
import { ground } from '../base.js';
import { KARSTS, LAKE_Y, LIFE, lakeBedY } from '../layout.js';

const W = LAKE_Y;                                                                        // top water voxel
const JL = ['canopyBlue', 'jungleLeafDark', 'jungleLeaf', 'jungleLeafLight', 'jungleLeafSun'];
const ROCK = ['limestone', 'limestoneLight', 'limestoneDark', 'limestoneStreak', 'limestoneOrange', 'limestoneNotch', 'karstMoss', 'caveRock', 'caveDark'];
// the towers are slimmer than the layout's nominal footprint (r 11/10/9) so the three read as separate spires
const SPEC = {
  brother1: { radius: 9, lean: 0.085, leanAngle: 142, buttresses: 2, notch: 2, gardens: 1.6, vines: 1.3, trees: 7, shrubs: 1.5 },
  brother2: { radius: 8, lean: 0.03, leanAngle: 60, buttresses: 2, notch: 2, gardens: 1.6, vines: 1.3, trees: 6, shrubs: 1.5 },
  brother3: { radius: 7.5, lean: 0.05, leanAngle: 300, buttresses: 1, notch: 2, gardens: 1.6, vines: 1.3, trees: 5, shrubs: 1.5 },
};
const DBG = (...a) => { if (globalThis.TOWERS_DEBUG) console.log('TOWERSDBG', ...a.map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))); };

export default function build(g, ctx) {
  ground(g, ctx);
  ctx.clip = false;                                                                        // nothing overshoots the box (checked)
  const rockIds = new Set(ROCK.map((n) => g.mat(n)));
  const lakeWater = g.mat('lakeWater'), leafIds = new Set(JL.map((n) => g.mat(n))), barkPale = g.mat('barkPale');
  const isRock = (x, y, z) => rockIds.has(g.get(x, y, z));
  const solid = (x, y, z) => { const id = g.get(x, y, z); return !!id && id !== lakeWater; };
  /** the empty cell just outside the rock face, walking from far out along (dx, dz) toward (x, z) at height y */
  const faceOut = (x, y, z, dx, dz, from = 30) => {
    for (let k = from; k > 0; k--) if (isRock(x + dx * (k - 1), y, z + dz * (k - 1))) return [x + dx * k, y, z + dz * k];
    return null;
  };
  const poi = (label, icon, target, zoom, yaw, pitch) => ctx.emit('poi', { label, icon, target, zoom, ...(yaw != null ? { yaw } : {}), ...(pitch != null ? { pitch } : {}) });
  /** a perch spot [x, y, z] (y = standing height) on the solid voxel nearest below/around p (branch tips, splintered tops) */
  const perchAt = ([px, py, pz]) => {
    let best = null;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = py + 1; y >= py - 3; y--) {
      if (!solid(px + dx, y, pz + dz) || solid(px + dx, y + 1, pz + dz)) continue;
      const sc = y - (Math.abs(dx) + Math.abs(dz)) * 0.6;
      if (!best || sc > best[3]) best = [px + dx + 0.5, y + 1, pz + dz + 0.5, sc];
      break;
    }
    return best ? best.slice(0, 3) : [px + 0.5, py + 1, pz + 0.5];
  };

  // ---- 1. the Three Brothers ----------------------------------------------------------------------------
  const K = Object.fromEntries(KARSTS.filter((k) => k.owner === 'towers').map((k) => [k.id, k]));
  const T = {};
  for (const id of ['brother1', 'brother2', 'brother3']) {
    const k = K[id];
    T[id] = karst(g, k.base, { height: k.height, profile: k.profile, water: W, leaves: JL, trunk: 'barkPale', seed: k.seed, ...SPEC[id] });
    DBG(id, { ...T[id] });
  }
  const { brother1: B1, brother2: B2, brother3: B3 } = T;
  // dripstone fringes hanging from the roofs of the waterline notches
  for (const t of [B1, B2, B3]) { const [[x0, , z0], [x1, , z1]] = t.bounds; stalactites(g, [x0, W + 1, z0], [x1, W + 7, z1], { density: 0.16, length: 3, floor: 0, seed: x0 }); }
  // colour accents in the summit jungles: a red young-leaf flush on brother2 (the dipterocarp forest's signature), yellow blossom on brother3
  ctx.P.add('towers_leafFlush', { color: '#b8452e', jitter: 0.06, sway: 0.3 });
  ctx.P.add('towers_leafFlushLight', { color: '#d4704f', jitter: 0.05, sway: 0.3 });
  const bloom = (cx, cz, r, mats, seed) => {      // paint the sunlit top of the canopy in a patch (columns within r)
    const M = mats.map((n) => g.mat(n));
    for (let x = Math.floor(cx - r); x <= cx + r; x++) for (let z = Math.floor(cz - r); z <= cz + r; z++) {
      if (Math.hypot(x - cx, z - cz) > r * (0.7 + 0.5 * hash3(x, 0, z, seed))) continue;
      const y = g.top(x, z);
      if (!leafIds.has(g.get(x, y, z))) continue;
      g.set(x, y, z, M[hash3(x, y, z, seed) < 0.6 ? 0 : 1]);
      if (leafIds.has(g.get(x, y - 1, z)) && hash3(x, y, z, seed + 1) < 0.5) g.set(x, y - 1, z, M[0]);
    }
  };
  bloom(B2.crown[0] + 3, B2.crown[2] + 3, 4, ['towers_leafFlush', 'towers_leafFlushLight'], 3);
  bloom(B3.crown[0] + 1, B3.crown[2] + 3, 3.5, ['yellowFlower', 'flameFlowerLight'], 4);
  // a short, dark lightning-struck snag poking out of brother1's summit jungle
  const sn = [B1.crown[0] + 2, 0, B1.crown[2] + 3];
  sn[1] = g.top(sn[0], sn[2]);
  const lookout = deadTree(g, [sn[0], sn[1] - 1, sn[2]], { bed: sn[1] - 5, height: 6, radius: 0.8, branches: 1, lean: 0.05, wood: ['deadWoodWet', 'deadWoodDark'], wet: 'deadWoodDark', seed: 404 });
  DBG('lookout', lookout);

  // ---- 2. sea cave at brother1's waterline (faces the viewer, +z) + kayakers paddling in ---------------------
  const seaCave = cave(g, [K.brother1.base[0] + 1, W, K.brother1.base[2] + 16], { dir: '+z', width: 10, height: 9, depth: 9, chamber: 5, glow: 0.5, water: 'lakeWater', level: W, vines: true, leaves: JL.slice(1), stalactites: 0.14, length: 3, seed: 4 });
  DBG('seaCave', seaCave);
  const [cmx, , cmz] = seaCave.mouth;
  // open the mouth up: clear the cliff foliage hanging in front of it, then a few thin vine strands at its edges
  for (let x = cmx - 5; x <= cmx + 5; x++) for (let y = W + 1; y <= W + 14; y++) for (let z = cmz - 2; z <= cmz + 4; z++) if (leafIds.has(g.get(x, y, z))) g.set(x, y, z, 0);
  for (const [dx, len] of [[-3, 6], [-2, 3], [2, 5], [3, 7]]) {
    let y = W + 14;
    while (y > W + 2 && !solid(cmx + dx, y, cmz - 1)) y--;
    for (let k = 1; k <= len && y - k > W + 1; k++) if (!g.get(cmx + dx, y - k, cmz)) g.set(cmx + dx, y - k, cmz, k % 3 ? 'jungleLeaf' : 'jungleLeafDark');
  }
  kayak(g, [cmx - 3, W, cmz + 2], { dir: '+x', seats: 2, color: 'kayakYellow', seed: 12 });  // broadside across the mouth: hull + both paddlers in profile

  // ---- 3. brother2: floating spirit-house raft, a macaque making off with the red soda, carved elephants, mooring snag ---
  const sx = K.brother2.base[0] + 5;                                                       // open water between raft and cave
  const f6 = faceOut(sx, 6, K.brother2.base[2], 0, 1), f1 = faceOut(sx, 1, K.brother2.base[2], 0, 1);
  DBG('b2 front', f6, f1);
  const dz0 = Math.min(f6[2], f1[2] + 1), deckZ1 = dz0 + 9, dx0 = sx - 6, dx1 = sx + 5, deckY = W + 1;
  for (let x = dx0; x <= dx1; x++) for (let z = dz0; z <= deckZ1; z++) {
    if (solid(x, deckY, z)) continue;
    const edge = x === dx0 || x === dx1 || z === deckZ1;
    g.set(x, deckY, z, edge ? 'bambooPoleDark' : ((x - dx0) % 2 ? 'bambooPole' : 'bambooMat'));
    if ((x === dx0 || x === dx1) && (z - dz0) % 3 === 1) g.set(x, W, z, 'raftFloat');          // blue barrel floats
  }
  const shrine = spiritHouse(g, [sx - 2, deckY + 1, dz0 + 3], { side: '+z', pillar: 2, seed: 5 });
  // the boatman kneeling in prayer at the side of the shrine (eyes closed: he hasn't noticed the macaques)
  person(g, [dx0 + 1, deckY + 1, dz0 + 5], { side: '+x', pose: 'sit', seed: 41, shirt: 'templeWhite' });
  // the 'before': a neat row of three red sodas with straws on the spirit house's porch (it draws two; add the third)
  { const [px, py, pz] = [sx - 2, deckY + 1, dz0 + 3], hy = py + 5; g.set(px, hy, pz + 2, 'sodaRed'); g.set(px, hy + 1, pz + 2, 'templeWhite'); }
  // the thief sits on a clear patch of pale bamboo mat at the camera-side front corner (nothing busy behind it),
  // clutching the stolen soda at hand height; a bottle lies tipped over beside it, straw out
  const thief = [dx1 - 3, deckY + 1, deckZ1 - 1];
  for (let x = thief[0] - 3; x <= dx1 - 1; x++) for (let z = deckZ1 - 3; z <= deckZ1 - 1; z++) if (!solid(x, deckY + 1, z)) g.set(x, deckY, z, 'bambooMat');
  g.set(thief[0] + 1, deckY + 2, thief[2], 'sodaRed'); g.set(thief[0] + 1, deckY + 3, thief[2], 'templeWhite');
  g.set(thief[0] - 2, deckY + 1, thief[2], 'sodaRed'); g.set(thief[0] - 3, deckY + 1, thief[2], 'templeWhite');
  // carved wooden elephants offered to the mountain spirit (at the back, by the cliff), a marigold basket, a clay pot
  for (const [ex, ez] of [[sx + 1, dz0 + 1], [sx + 1, dz0 + 3]]) {
    g.box([ex, deckY + 1, ez], [ex + 2, deckY + 2, ez], 'plankDark');                     // legs + body (facing +x)
    g.set(ex + 1, deckY + 1, ez, 0);
    g.set(ex + 3, deckY + 2, ez, 'plankDark'); g.set(ex + 3, deckY + 1, ez, 'beam');          // head + trunk
    g.set(ex + 3, deckY + 3, ez, 'marigold');                                               // a garland on its head
  }
  for (const [x, z, m] of [[dx0 + 2, dz0 + 1, 'marigold'], [dx0 + 3, dz0 + 1, 'bambooMatDark'], [dx0 + 1, dz0 + 2, 'thaiClay']]) g.put(x, deckY + 1, z, m, 'keep');
  // the raft is moored to a drowned snag beside it; a marigold garland hangs on its stub
  const snagP = [dx1 + 2, W, dz0 + 2];
  const sacred = deadTree(g, snagP, { bed: lakeBedY(snagP[0], snagP[2]), height: 13, branches: 2, lean: 0.04, seed: 77 });
  g.line([dx1, deckY + 1, dz0 + 3], [snagP[0] - 1, W + 4, snagP[2]], 'fiberRope', { r: 0.4, mode: 'keep' });
  for (const [ex, ey, ez] of [[1, 6, 0], [1, 5, 1], [0, 5, 1], [-1, 6, 1], [1, 5, -1]]) g.put(snagP[0] + ex, W + ey, snagP[2] + ez, 'marigold', 'keep');
  // a thread of incense smoke rising from the offering table
  if (shrine.table) { const [tx, ty, tz] = shrine.table; ctx.emit('particles', { preset: 'smoke', box: [[tx - 0.5, ty + 2, tz - 0.5], [tx + 1.5, ty + 10, tz + 1.5]], count: 10, size: 0.7, opacity: 0.4, speed: 0.12, seed: 9 }); }
  // the boatman poled his shrine raft here: the bamboo punt pole leans against the spirit house's pillar
  g.line([dx1 - 1, deckY + 1, dz0 + 1], [dx1 + 1, deckY + 14, dz0 + 6], 'bambooPoleDark', { r: 0.5, mode: 'keep' });

  // ---- 4. brother3: swiftlet-nest collectors' bamboo ladder up to a high cave (bats come home at dawn) --------
  const lx = K.brother3.base[0] - 1, nestY = 34;
  const hiCave = cave(g, [lx + 1, nestY, K.brother3.base[2] + 12], { dir: '+z', width: 4, height: 5, depth: 6, chamber: false, glow: false, stalactites: 0.1, length: 2, vines: 0.6, leaves: JL.slice(1), seed: 9 });
  DBG('hiCave', hiCave);
  const ladderTop = hiCave.mouth[1];
  let prevZ = null;
  const ladder = [];
  for (let y = W + 1; y <= ladderTop + 2; y++) {
    let zl = -Infinity;
    for (const x of [lx, lx + 1, lx + 2]) { const f = faceOut(x, y, K.brother3.base[2], 0, 1); if (f) zl = Math.max(zl, f[2]); }
    if (!Number.isFinite(zl)) continue;
    if (y > ladderTop - 1) zl = Math.min(zl, hiCave.mouth[2] + 1);
    for (let x = lx - 1; x <= lx + 3; x++) for (let z = zl; z <= zl + 3; z++) for (let yy = y - 1; yy <= y + 2; yy++) if (leafIds.has(g.get(x, yy, z))) g.set(x, yy, z, 0); // keep the ladder clear of foliage
    for (const x of [lx, lx + 2]) {
      g.put(x, y, zl, 'bambooPole', 'keep');
      if (prevZ != null && prevZ !== zl) for (let z = Math.min(prevZ, zl); z <= Math.max(prevZ, zl); z++) g.put(x, y, z, 'bambooPole', 'keep');
    }
    if (y % 3 === 0) g.put(lx + 1, y, zl, 'bambooPoleDark', 'keep');
    if (y % 6 === 0) for (let z = zl - 1; z >= zl - 3 && !isRock(lx, y, z); z--) g.put(lx, y, z, 'fiberRope', 'keep'); // lashings to the rock
    ladder.push([y, zl]);
    prevZ = zl;
  }
  // clear the cliff shrubs between the camera and the climber (the view ray runs toward +x/+z)
  for (const [y, zl] of ladder) if (y >= 14 && y <= 26) for (let x = lx - 1; x <= lx + 8; x++) for (let z = zl; z <= zl + 8; z++) {
    const id = g.get(x, y, z);
    if (leafIds.has(id) || id === barkPale) g.set(x, y, z, 0);
  }
  // a collector climbing (facing the rock), a basket on his back; a helper on the bamboo raft below
  const climbY = 17, cz = ladder.find(([y]) => y === climbY)?.[1] ?? K.brother3.base[2] + 8;
  person(g, [lx, climbY, cz + 1], { side: '-z', seed: 52, shirt: 'longtailPaint', hat: 'thatchPalmLight' });
  for (const [dx, dy] of [[0, 3], [1, 3], [0, 4], [1, 4]]) g.put(lx + dx, climbY + dy, cz + 2, 'bambooMatDark', 'keep');
  const rz0 = (ladder[0]?.[1] ?? cz) + 1;
  for (let x = lx - 3; x <= lx + 5; x++) for (let z = rz0; z <= rz0 + 3; z++) if (!solid(x, W + 1, z)) g.set(x, W + 1, z, z === rz0 + 3 || x === lx - 3 || x === lx + 5 ? 'bambooPoleDark' : 'bambooPole');
  person(g, [lx + 3, W + 2, rz0 + 1], { side: '-z', pose: 'wave', seed: 53 });
  for (const [x, z] of [[lx - 2, rz0 + 1], [lx - 2, rz0 + 2], [lx - 1, rz0 + 2]]) g.put(x, W + 2, z, 'bambooMatDark', 'keep');

  // ---- 5. drowned forest in the western shallows + a fisherman casting his net ------------------------------
  const perches = [];
  const SNAGS = [[48, -116, 15], [52, -110, 9], [46, -104, 18], [54, -100, 7], [49, -95, 12], [45, -87, 10], [51, -81, 14], [48, -74, 7], [46, -62, 8]];
  for (const [i, [x, z, h]] of SNAGS.entries()) {
    const d = deadTree(g, [x, W, z], { bed: lakeBedY(x, z), height: h, radius: 0.75 + h * 0.03, seed: 300 + i });
    perches.push(perchAt(d.perch));
  }
  // a fisherman in a small sampan on the calm water east of the spirit raft, paying out a gill net: the float line of
  // plastic bottles (white / blue every 2) trails astern toward brother2's foot
  const sb = [102, -62];                                                                    // bow tip; the sampan heads −x, stern at sb.x + 8
  for (let x = sb[0]; x <= sb[0] + 8; x++) for (let z = sb[1] - 1; z <= sb[1] + 2; z++) {
    const bow = x <= sb[0] + 1, side = z === sb[1] - 1 || z === sb[1] + 2;
    if (bow && side) continue;                                                              // pointed bow
    g.set(x, W, z, 'longtailHullDark');                                                     // bottom, riding in the water's top layer
    if (side || x === sb[0] || x === sb[0] + 8) g.set(x, W + 1, z, 'longtailHull');          // gunwale
  }
  for (const z of [sb[1], sb[1] + 1]) g.set(sb[0], W + 2, z, 'longtailHull');               // the bow lifts a little
  g.set(sb[0] + 3, W + 1, sb[1] + 1, 'fiberRope'); g.set(sb[0] + 2, W + 1, sb[1], 'fiberRope'); g.set(sb[0] + 3, W + 1, sb[1], 'longtailHullDark');   // net heap
  person(g, [sb[0] + 6, W + 1, sb[1]], { side: '+x', pose: 'sit', seed: 62, hat: 'thatchPalmLight' });
  g.line([sb[0] + 5, W + 2, sb[1] - 1], [sb[0] + 1, W + 4, sb[1] - 3], 'plankDark', { r: 0.4, mode: 'keep' });   // the oar
  for (let t = 0; t <= 20; t += 2) {                                                         // float line, paying out astern in a lazy arc
    const x = Math.round(sb[0] + 9 + 3 * Math.sin((t / 20) * Math.PI)), z = Math.round(sb[1] - 1 - t * 0.7);
    if (!solid(x, W + 1, z)) g.set(x, W + 1, z, (t / 2) % 2 ? 'raftFloat' : 'templeWhite');
  }

  // ---- 5b. the "little brother": a tiny leaning islet in front, one tree on its rim leaning out over the water ----------
  const iA = 60, tA = (170 * Math.PI) / 180, iD = [Math.cos(tA), Math.sin(tA)];                // the rock leans to 60°, its tree out west (across the view, clear of the cave's sight line)
  const islet = karstIslet(g, [55, lakeBedY(55, -65), -65], { water: W, height: 16, radius: [5, 3.5], lean: 0.15, leanAngle: iA, profile: 'tower', cap: false, shrubs: 0.4, leaves: JL, trunk: 'barkDark', seed: 51 });
  {
    const [tx, , tz] = islet.top, colTop = (x, z) => { let y = W + 20; while (y > W && !isRock(x, y, z)) y--; return y; };
    let rx = tx, rz = tz, ry = colTop(tx, tz);
    for (let k = 1; k < 8; k++) {                                                          // walk out to the rim on the leaning side
      const x = Math.round(tx + iD[0] * k), z = Math.round(tz + iD[1] * k), y = colTop(x, z);
      if (y < ry - 2 || y <= W) break;
      rx = x; rz = z; ry = y;
    }
    const tip = [rx + iD[0] * 5.5, ry + 4, rz + iD[1] * 5.5];
    g.tube([[rx, ry, rz], [rx + iD[0] * 2.2, ry + 2.5, rz + iD[1] * 2.2], tip], 'barkDark', { r: 0.6, r2: 0.5, mode: 'keep' });
    const blobs = [{ c: [tip[0], tip[1] + 0.6, tip[2]], r: 2.8 }];
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.4; blobs.push({ c: [tip[0] + Math.cos(a) * 2.2, tip[1] + (i % 2 ? -0.3 : 0.4), tip[2] + Math.sin(a) * 2.2], r: 1.9 }); }
    foliage(g, blobs, { leaves: ['canopyBlue', 'jungleLeafDark', 'jungleLeaf', 'jungleLeafLight'], squash: 0.55, roughness: 0.3, speckle: 0.12, bias: -0.05, seed: 52, mode: 'keep' });
    DBG('islet', islet, { rim: [rx, ry, rz], tip });
  }

  // ---- 6. fallen limestone blocks at the towers' feet ------------------------------------------------------------
  const blocks = [];
  for (const [x, z, s, i] of [[79, -84, [3, 3.5, 2.5], 1], [65, -111, [2.5, 2.5, 2], 2], [111, -92, [2.5, 3, 2], 4], [84, -101, [2, 2.5, 2], 5]]) {
    if (solid(x, W + 1, z)) continue;
    const bed = lakeBedY(x, z), hy = (W + s[1] - bed) / 2;                 // a tall block standing on the bed, poking out s[1]
    rock(g, [x, bed, z], { size: [s[0], hy, s[2]], bury: 0.05, stone: ['limestoneDark', 'limestone', 'limestoneLight'], moss: 'karstMoss', seed: 900 + i,
      mode: 'replace' });
    let y = W + 1;
    while (solid(x, y, z)) y++;
    blocks.push([x, y, z]);
  }
  DBG('blocks', blocks);

  // ---- 7. the morning mist bank: big faint particle haze lying on the back water, the towers' feet dissolving into it --
  // The emitter volumes leave out the sea-cave mouth (cmx ± 8 in front of it) and the vignettes at the waterline (the
  // spirit raft, the sampan and its floats, the nest collectors' ladder): over the raft a belt of haze floats at y 20–30, so the
  // Brothers' lowest third still melts into white from the overview while the stories below read crisp up close.
  const haze = { preset: 'mist', motion: 'drift', sizeJitter: 0.25, speed: 0.02, turbulence: 0.4, sway: 0, glow: 1, fade: 0.3, colors: ['#ffffff', '#f6efe4'] };
  ctx.emit('particles', { ...haze, box: [[30, 1, -120], [118, 14, cmz - 4]], count: 50, size: 20, opacity: 0.22, seed: 5 });    // the bank on the back water
  ctx.emit('particles', { ...haze, box: [[30, 1, cmz - 3], [cmx - 9, 16, -60]], count: 18, size: 18, opacity: 0.2, seed: 6 });  // among the drowned snags + islet
  ctx.emit('particles', { ...haze, box: [[110, 1, cmz - 3], [118, 5, -78]], count: 6, size: 20, opacity: 0.22, seed: 7 });      // at brother3's south-east foot
  ctx.emit('particles', { ...haze, box: [[cmx + 9, 20, cmz - 2], [97, 30, -64]], count: 40, size: 9, opacity: 0.12, seed: 3 });    // the belt above the raft (not the ladder)
  ctx.emit('particles', { ...haze, box: [[40, 1, -62], [118, 4, -46]], count: 28, size: 16, opacity: 0.14, seed: 8 });          // a thin tongue toward the village

  // ---- 8. life -------------------------------------------------------------------------------------------------
  // one long-tail tour boat looping the open water in front of the towers: a long thin loop at z −50…−56 (north of the
  // rafts' fish cages, south of the sampan); it starts at the west end so the stops' frames are clear at t = 3
  const oval = [[64, -50], [50, -52], [60, -55], [96, -56], [114, -55], [114, -51], [100, -50], [80, -50]];
  ctx.emit('actors', { creature: 'longtailBoat', on: 'water', behavior: 'path', count: 1, options: { canopy: true, passengers: 3 }, path: oval });
  ctx.emit('actors', { ...LIFE.fish, count: 10, area: [[46, -70], [116, -44]] });
  // the towers' sky belongs to a pair of Brahminy kites, wheeling well above the summit snag
  ctx.emit('actors', { creature: 'bird', options: { body: '#f2ece0', wing: '#a4502a', tip: '#3a2416', beak: '#e8c040' }, behavior: 'circle', count: 2, center: [86, lookout.top[1] + 10, -94], radius: 28, wobble: 2 });
  // kingfishers darting between the drowned snags
  ctx.emit('actors', { ...LIFE.kingfisher, count: 2, spots: perches });
  // the macaque troop: the thief at the raft's front edge clutching the stolen soda, the rest watching from brother2's
  // ledges above the raft and from the mooring snag
  const b2low = B2.ledges.filter(([x, y, z]) => z > K.brother2.base[2] + 2 && y > 10 && y < 40).slice(0, 2);
  ctx.emit('actors', { ...LIFE.macaque, spots: [
    [thief[0] + 0.5, thief[1], thief[2] + 0.5, 345], ...b2low.map(([x, y, z], i) => [x + 0.5, y, z + 0.5, 160 + i * 40]),
    ...sacred.branches.slice(0, 1).map((b) => [...perchAt(b), 250]),
  ] });
  // dusky langurs resting on brother1's front ledges
  const front = B1.ledges.filter(([x, y, z]) => z > K.brother1.base[2] - 1 && y > 12 && y < 70).slice(0, 3);
  if (front.length) ctx.emit('actors', { ...LIFE.langur, spots: front.map(([x, y, z], i) => [x + 0.5, y, z + 0.5, 20 + i * 50]) });
  // bats streaming home into the high cave
  const cm = hiCave.mouth;
  ctx.emit('actors', { creature: 'bat', behavior: 'path', loop: 'restart', count: 8, spread: [6, 0.4], wobble: 1,
    path: [[118, 70, -48], [114, 58, -62], [110, 46, -74], [cm[0] + 1, cm[1] + 4, cm[2] + 8], [cm[0] + 0.5, cm[1] + 2, cm[2] + 1], [cm[0] + 0.5, cm[1] + 2, cm[2] - 4]] });
  // the tour stops (the Three Brothers closes the whole tour)
  poi('Sea cave & the stolen red soda', '🐒', [85, 8, -76], 7.5, 20, 30);
  poi('Nest collectors\' bamboo ladder', '🪜', [99, 18, -93], 10);
  poi('The Three Brothers', '⛰️', [96, 68, -92], 3, undefined, 14);   // looking up at the spires; the slab corner and the giant stay out
  DBG('langurs', front);
}
