// Family Autumn — the autumn forest tile around the cabin (part of the room module, prefix rm).
// Tall trees stand behind (−z) and left (−x) of the cabin; the open +x/+z sides stay low and calm.
import { noise, hash3, clamp, oak, pine, foliage, rng } from '../lib/index.js';

export const GROUND_Y = -7;                       // forest floor top; the cabin floor (y = 0) sits on a stone foundation
const TX0 = -32, TX1 = 82, TZ0 = -32, TZ1 = 66;   // tile footprint
const DEPTH = 9;

const W = (c, o = {}) => ({ color: c, jitter: 0.05, ...o });
export const FOREST_MATERIALS = {
  // forest floor: earthy base + leaf litter in four autumn mixes (soft patches)
  rmGround: { colors: ['#8e6c40', '#946f42', '#8a693e'], jitter: 0.04 },
  rmLitterO: { colors: ['#d8782a', '#de822e', '#d27028'], jitter: 0.04 },
  rmLitterR: { colors: ['#a8442a', '#b24a2c', '#a03e28'], jitter: 0.04 },
  rmLitterY: { colors: ['#e2a83e', '#e8b046', '#da9e38'], jitter: 0.04 },
  rmLitterB: { colors: ['#9a6434', '#926030', '#a06a38'], jitter: 0.04 },
  rmMossG: { colors: ['#6a7a38', '#7a8a42', '#5a6a30'], jitter: 0.06 },
  rmDryGrass: W('#b49a52', { sway: 0.9 }), rmDryGrassDk: W('#8a7a3e', { sway: 0.8 }),
  // tile sides (strata)
  rmSoilTop: W('#6e4c2e'), rmSoil1: W('#5e4028'), rmSoil2: W('#4c3420'), rmRockSide: W('#6e6860', { noise: { color: '#5a5650', scale: 0.25, amount: 0.7 } }),
  // canopies: red maple, orange, golden, yellow birch
  rmRed1: W('#9a3020', { sway: 0.4 }), rmRed2: W('#c4462a', { sway: 0.45 }), rmRed3: W('#e26c40', { sway: 0.5 }),
  rmOr1: W('#b4501e', { sway: 0.4 }), rmOr2: W('#dc7426', { sway: 0.45 }), rmOr3: W('#f39a3a', { sway: 0.5 }),
  rmGo1: W('#c07c22', { sway: 0.4 }), rmGo2: W('#e2a636', { sway: 0.45 }), rmGo3: W('#f4cc5c', { sway: 0.5 }),
  rmYe1: W('#d8a832', { sway: 0.5 }), rmYe2: W('#eec24a', { sway: 0.55 }), rmYe3: W('#f8dc78', { sway: 0.6 }),
  // backlit golden maple seen through the big window: a touch of glow so the kitten reads in silhouette
  rmGlow1: W('#e8a238', { sway: 0.45, emissive: 0.16 }), rmGlow2: W('#f6c04e', { sway: 0.5, emissive: 0.24 }), rmGlow3: W('#ffdc80', { sway: 0.55, emissive: 0.32 }),
  rmBirch: W('#e8e2d4', { jitter: 0.03 }), rmBirchMark: W('#3a3430'),
  rmTrunk: W('#5a3e2a', { noise: { color: '#46301f', scale: 0.35, amount: 0.7 } }),
  // props
  rmLanternGlow: { color: '#ffd080', emissive: 5, flicker: 0.25, flickerSpeed: 1.3, light: { color: '#ffaa50', radius: 12, intensity: 0.9 } },
  rmLanternIron: W('#2e2a28', { roughness: 0.5, metalness: 0.5 }),
  rmPath: { colors: ['#8a857c', '#9a948a', '#7a756e'], jitter: 0.05 },
  rmMushCap: W('#c8402e'), rmMushDot: W('#f2ece0'), rmMushTan: W('#b8865a'),
};

const LEAVES = {
  red: ['rmRed1', 'rmRed2', 'rmRed3'],
  orange: ['rmOr1', 'rmOr2', 'rmOr3'],
  gold: ['rmGo1', 'rmGo2', 'rmGo3'],
  yellow: ['rmYe1', 'rmYe2', 'rmYe3'],
  mixed: ['rmRed2', 'rmOr2', 'rmOr3', 'rmGo3'],
  glow: ['rmGlow1', 'rmGlow2', 'rmGlow3'],
};
const LITTER = { red: 'rmLitterR', orange: 'rmLitterO', gold: 'rmLitterY', yellow: 'rmLitterY', mixed: 'rmLitterO', glow: 'rmLitterY' };

// big trees: [x, z, height (crown top above ground), crown radius, palette, seed]
const TREES = [
  // behind the back wall (rise over it, fill the big window)
  [-18, -21, 76, 13, 'red', 3],
  [6, -22, 66, 11, 'orange', 5],
  [28, -24, 82, 14, 'gold', 8],
  [46, -19, 70, 11, 'red', 11],
  [53, -17, 38, 10, 'glow', 13],                // young sunlit maple filling the big window
  [72, -23, 72, 11, 'gold', 17],
  // left side (over the left wall, through the small window)
  [-21, 12, 74, 12, 'orange', 19],
  [-19, 38, 62, 11, 'red', 23],
  [-23, 60, 44, 9, 'gold', 29],
];
const PINES = [[-28, -4, 60, 7], [68, -29, 58, 6], [15, -30, 64, 7], [-29, 26, 54, 6]];
const BIRCHES = [[79, -17, 46, 7], [-10, -13, 52, 8]];

// highest solid voxel at (x, z) scanning down from `from` (g.top() recomputes bounds after every write: slow in loops)
const surf = (g, x, z, from) => { for (let y = from; y >= GROUND_Y - 3; y--) if (g.get(x, y, z)) return y; return -Infinity; };

export function buildForest(g, P, { L }) {
  const R = rng(404);
  const N = noise(808);
  const lit = new Map();   // per-column litter tint near trees

  // ---- tile: rounded-rect footprint, gentle bumps, strata sides ----
  const cr = 10;
  const inside = (x, z) => {
    const dx = Math.max(TX0 + cr - x, 0, x - (TX1 - cr)), dz = Math.max(TZ0 + cr - z, 0, z - (TZ1 - cr));
    return Math.hypot(dx, dz) <= cr + 0.3 * N.simplex2(x * 0.3, z * 0.3);
  };
  const near = (x, z) => {
    let best = null, bd = 1e9;
    for (const t of TREES) { const d = Math.hypot(x - t[0], z - t[1]) / (t[3] * 1.3); if (d < bd) { bd = d; best = t; } }
    return bd < 1 ? best : null;
  };
  const top = (x, z) => GROUND_Y + (N.fbm2(x * 0.05, z * 0.05) > 0.25 ? 1 : 0);
  for (let z = TZ0; z <= TZ1; z++) for (let x = TX0; x <= TX1; x++) {
    if (!inside(x, z)) continue;
    const ty = top(x, z);
    for (let y = GROUND_Y - DEPTH; y <= ty; y++) {
      const dd = ty - y;
      const wob = Math.round(N.simplex2(x * 0.08 + 3, z * 0.08) * 1.2);
      let m;
      if (dd === 0) m = groundTop(x, z, N, near);
      else if (dd <= 1) m = 'rmSoilTop';
      else if (dd + wob <= 3) m = 'rmSoil1';
      else if (dd + wob <= 5) m = 'rmSoil2';
      else m = 'rmRockSide';
      g.set(x, y, z, m);
    }
  }

  // ---- trees ----
  for (const [x, z, h, r, pal, seed] of TREES) {
    const y = top(x, z) + 1;
    autumnTree(g, [x, y, z], h, r, LEAVES[pal], seed);
    leafPile(g, x, z, r, LITTER[pal], seed);
  }
  for (const [x, z, h, r] of PINES) pine(g, [x, top(x, z) + 1, z], { height: h, radius: r, trunk: 'rmTrunk', seed: x * 7 + z });
  for (const [x, z, h, r] of BIRCHES) birch(g, [x, top(x, z) + 1, z], h, r, x * 13 + z);

  // ---- woodpile with a little lean-to, right of the cabin ----
  woodpile(g, [69, GROUND_Y + 1, -9]);

  // ---- lantern post at the front-right corner ----
  const lp = [69, GROUND_Y + 1, 57];
  g.box(lp, [lp[0], lp[1] + 9, lp[2]], 'rmBeam');
  g.box([lp[0] - 1, lp[1] + 10, lp[2]], [lp[0] + 1, lp[1] + 10, lp[2]], 'rmBeam');
  g.set(lp[0] - 1, lp[1] + 9, lp[2], 'rmLanternIron');
  g.box([lp[0] - 2, lp[1] + 6, lp[2] - 1], [lp[0], lp[1] + 8, lp[2] + 1], 'rmLanternIron');
  g.box([lp[0] - 2, lp[1] + 6, lp[2]], [lp[0], lp[1] + 7, lp[2]], 'rmLanternGlow');
  g.box([lp[0] - 1, lp[1] + 6, lp[2] - 1], [lp[0] - 1, lp[1] + 7, lp[2] + 1], 'rmLanternGlow');

  // ---- raked leaf pile + rake, wheelbarrow of pumpkins (right side, by the woodpile) ----
  leafHeap(g, [75, top(75, 40) + 1, 40], 5, 3);
  g.line([79, GROUND_Y + 1, 45], [81, GROUND_Y + 9, 49], 'rmBeam');
  g.box([78, GROUND_Y + 1, 44], [80, GROUND_Y + 1, 44], 'rmLanternIron');
  wheelbarrow(g, [75, top(75, 24) + 1, 22]);
  // a second little lantern on the ground by the front-left corner
  const ll = [-6, top(-6, 60) + 1, 60];
  g.box(ll, [ll[0] + 1, ll[1], ll[2] + 1], 'rmLanternIron');
  g.box([ll[0], ll[1] + 1, ll[2]], [ll[0] + 1, ll[1] + 2, ll[2] + 1], 'rmLanternGlow');
  g.box([ll[0], ll[1] + 3, ll[2]], [ll[0] + 1, ll[1] + 3, ll[2] + 1], 'rmLanternIron');
  g.set(ll[0], ll[1] + 4, ll[2], 'rmLanternIron');

  // ---- stepping-stone path from the front-right toward the cabin corner ----
  const path = [[80, 64], [76, 62], [71, 60], [66, 58]];
  for (let i = 0; i < path.length; i++) {
    const [px, pz] = path[i];
    const rr = 2.2 + hash3(i, 0, 0, 3) * 0.8;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (Math.hypot(dx, dz * 1.2) > rr) continue;
      const x = px + dx, z = pz + dz;
      if (!inside(x, z)) continue;
      g.set(x, top(x, z), z, 'rmPath');
    }
  }

  // ---- pumpkins, mushrooms, rocks, dry grass ----
  const pumpkins = [[58, 61, 2.6], [62.5, 60, 1.9], [60, 64.5, 1.5], [-10, 58, 2.2], [78, 32, 1.8], [36, -9, 1.6], [-2, 62, 1.5]];
  for (const [x, z, r] of pumpkins) bigPumpkin(g, [Math.round(x), top(Math.round(x), Math.round(z)) + 1, Math.round(z)], r, r === 1.5 ? 'rmGourdW' : 'rmPumpkin');
  // mushrooms at tree bases and along the foundation
  for (const [x, z, h, r] of TREES) for (let k = 0; k < 1; k++) {
    const a = R() * Math.PI * 2, d = 2 + R() * 3;
    const mx = Math.round(x + Math.cos(a) * d), mz = Math.round(z + Math.sin(a) * d);
    shroom(g, [mx, top(mx, mz) + 1, mz], R.chance(0.6));
  }
  for (const [x, z] of [[4, 53], [9, 54], [65, 24]]) shroom(g, [x, top(x, z) + 1, z], true);
  for (const [x, z, s] of [[76, 50, 2.6], [-14, 50, 2.6], [79, 8, 3], [-25, -25, 3], [44, 62, 2]]) mossRock(g, [x, top(x, z) + 1, z], s, x + z);
  // dry grass tufts and fallen-leaf bumps (calm in front, denser at the back/left)
  for (let z = TZ0; z <= TZ1; z++) for (let x = TX0; x <= TX1; x++) {
    if (!inside(x, z)) continue;
    if (x >= -9 && x <= 69 && z >= -9 && z <= 57) continue;   // cabin footprint
    const h = hash3(x, 9, z, 77);
    const y = surf(g, x, z, GROUND_Y + 2) + 1;
    if (y > GROUND_Y + 2 || g.get(x, y, z)) continue;
    const front = z > 54 || x > 66;
    if (h < (front ? 0.003 : 0.012)) { g.set(x, y, z, 'rmDryGrass'); if (h < 0.003) g.set(x, y + 1, z, 'rmDryGrassDk'); }
    else if (h < (front ? 0.006 : 0.03)) g.set(x, y, z, ['rmLitterO', 'rmLitterR', 'rmLitterY', 'rmLitterB'][Math.floor(hash3(x, z, 4) * 4)]);
  }

  // ---- particles + life ----
  // falling leaves: big flat tumbling leaves above/around the trees, a few along the outer sides of the cabin
  // and past the back window — never inside the room (interior x 0..63, z 0..51).
  const LEAF = { preset: 'leaves', colors: ['#e07a26', '#c0402a', '#e8b040', '#9a5a2a'], size: 0.9, sizeJitter: 0.3, flat: 0.12, spin: 2.2, sway: 2.6, speed: 0.32, turbulence: 0.8 };
  const particles = [
    { ...LEAF, count: 190, box: [[-32, 20, -40], [82, 84, -6]], seed: 11 },            // behind, over the back trees
    { ...LEAF, count: 95, box: [[-36, 20, -6], [-6, 80, 66]], seed: 12 },             // left, over the left trees
    { ...LEAF, count: 32, box: [[68, -6, -12], [84, 52, 3]], seed: 13 },               // right outer side, past the back-right corner
    { ...LEAF, count: 26, box: [[-4, 42, -8], [64, 70, -4]], seed: 15 },               // drifting over the back eave
    { ...LEAF, count: 34, box: [[44, 4, -8], [64, 40, -5]], seed: 14, speed: 0.24, size: 1, colors: ['#c0402a', '#9a3a1e', '#a8582a', '#d0602a'] }, // past the back window
    { ...LEAF, count: 14, box: [[-6, -6, 56], [70, 0, 68]], seed: 16, speed: 0.2 },     // a few settling on the ground in front
  ];
  const actors = [
    { creature: 'bird', count: 4, behavior: 'flock', center: [30, 80, -16], radius: 26, seed: 5, options: { body: '#5a4a3e', wing: '#7a6450', tip: '#2a2420', beak: '#e0a040' } },
    { creature: 'squirrel', count: 2, area: [[64, 52], [80, 64]], seed: 3, scale: 0.9, options: [{ coat: 'red' }, { coat: 'grey' }] },
    { creature: 'squirrel', count: 1, area: [[68, 8], [80, 36]], seed: 8, scale: 0.9 },
  ];
  return { particles, actors };
}

function autumnTree(g, p, h, r, leaves, seed) {
  const R = rng(seed);
  const [x, y, z] = p;
  const crown = y + h - r * 0.95;                         // centre of the main crown
  const lean = [R.range(-1.5, 1.5), R.range(-1.5, 1.5)];
  const top = [x + lean[0], crown - r * 0.2, z + lean[1]];
  const tr = Math.max(1.2, h / 32);
  g.tube([[x, y - 1, z], [x + lean[0] * 0.3, y + h * 0.3, z + lean[1] * 0.3], top], 'rmTrunk', { r: tr * 1.3, r2: tr * 0.75 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + R.range(-0.3, 0.3); g.line([x, y, z], [x + Math.cos(a) * tr * 2.4, y - 0.5, z + Math.sin(a) * tr * 2.4], 'rmTrunk', { r: 0.8 }); }
  const blobs = [{ c: [top[0], crown, top[2]], r }];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R.range(-0.4, 0.4);
    const d = r * R.range(0.6, 0.85);
    const c = [top[0] + Math.cos(a) * d, crown - r * R.range(0.25, 0.75), top[2] + Math.sin(a) * d];
    const br = r * R.range(0.5, 0.68);
    g.line([top[0], c[1] - br * 0.9, top[2]], [c[0], c[1] - br * 0.3, c[2]], 'rmTrunk', { r: tr * 0.5, r2: tr * 0.3 });
    blobs.push({ c, r: br });
  }
  for (let i = 0; i < 4; i++) { const d = R.dir(); blobs.push({ c: [top[0] + d[0] * r * 0.5, crown + Math.abs(d[1]) * r * 0.45, top[2] + d[2] * r * 0.5], r: r * R.range(0.5, 0.62) }); }
  foliage(g, blobs, { leaves, seed: seed * 31, roughness: 0.2, freq: 0.18, squash: 0.92, holes: 0.05, speckle: 0.04 });
}

function groundTop(x, z, N, near) {
  const t = near(x, z);
  const front = z > 50 || x > 62;                 // the margins in front of the open sides: calm, big patches
  const sc = front ? 0.035 : 0.06;
  const n = N.fbm2(x * sc, z * sc, { octaves: 2 }), n2 = N.simplex2(x * sc * 1.8 + 7, z * sc * 1.8 - 3);
  const h = hash3(x, 0, z, 61);
  // under a tree: its own litter in soft-edged patches (smooth noise, not per-voxel dice)
  if (t && N.simplex2(x * 0.18 + 11, z * 0.18 - 5) > -0.35) return LITTER[t[4]];
  let m = 'rmGround';
  if (n > 0.18) m = 'rmLitterO';
  else if (n < -0.28) m = 'rmLitterR';
  else if (n2 > 0.4) m = 'rmLitterY';
  else if (n2 < -0.6) m = 'rmMossG';
  if (h < (front ? 0.01 : 0.03)) return ['rmLitterB', 'rmLitterO', 'rmLitterY', 'rmGround'][Math.floor(hash3(x, 1, z, 62) * 4)];
  return m;
}

function leafPile(g, x, z, r, mat, seed) {
  const N = noise(seed + 100);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const d = Math.hypot(dx, dz) / r;
    if (d > 1 || d < 0.15) continue;
    if (N.simplex2((x + dx) * 0.25, (z + dz) * 0.25) + (1 - d) * 0.4 < 0.35) continue;
    const y = surf(g, x + dx, z + dz, GROUND_Y + 2);
    if (y > GROUND_Y + 1 || y < GROUND_Y - 1) continue;
    if (N.simplex2((x + dx) * 0.6 + 4, (z + dz) * 0.6) > -0.45) g.set(x + dx, y + 1, z + dz, mat);
  }
}

function birch(g, p, h, r, seed) {
  for (let y = 0; y < h * 0.75; y++) {
    const m = hash3(p[0], p[1] + y, p[2], seed) < 0.18 ? 'rmBirchMark' : 'rmBirch';
    g.set(p[0], p[1] + y, p[2], m);
    if (y < h * 0.35) { g.set(p[0] + 1, p[1] + y, p[2], (y + seed) % 5 === 0 ? 'rmBirchMark' : 'rmBirch'); g.set(p[0], p[1] + y, p[2] + 1, 'rmBirch'); g.set(p[0] + 1, p[1] + y, p[2] + 1, (y + seed) % 7 === 0 ? 'rmBirchMark' : 'rmBirch'); }
  }
  const R = rng(seed);
  const blobs = [];
  for (let i = 0; i < 6; i++) blobs.push({ c: [p[0] + R.range(-r * 0.6, r * 0.6), p[1] + h * 0.55 + i * h * 0.07, p[2] + R.range(-r * 0.6, r * 0.6)], r: r * R.range(0.45, 0.7) });
  for (const b of blobs) g.line([p[0], b.c[1] - 3, p[2]], b.c, 'rmBirch');
  foliage(g, blobs, { leaves: LEAVES.yellow, seed, roughness: 0.22, holes: 0.06, speckle: 0.04 });
}

function bigPumpkin(g, [x, y, z], r, m) {
  const h = r * 0.72;
  g.ellipsoid([x, y + h - 0.5, z], [r, h, r], (px, py, pz) => {
    const a = Math.atan2(pz - z, px - x);
    return Math.cos(a * 6) > 0.6 ? (m === 'rmPumpkin' ? 'rmPumpkinDk' : 'rmGourdW') : m;
  });
  g.box([x, Math.round(y + 2 * h - 0.5), z], [x, Math.round(y + 2 * h + 0.5), z], 'rmStem');
  g.set(x + 1, Math.round(y + 2 * h - 0.5), z, 'rmPlant');
}

function leafHeap(g, [x, y, z], r, h) {
  const N = noise(x * 3 + z);
  const mats = ['rmLitterO', 'rmLitterR', 'rmLitterY', 'rmLitterO', 'rmLitterB'];
  for (let dy = 0; dy <= h; dy++) for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    const d = Math.hypot(dx / r, dy / h, dz / r) + N.simplex3(dx * 0.4, dy * 0.4, dz * 0.4) * 0.18;
    if (d > 1) continue;
    g.set(x + dx, y + dy, z + dz, mats[Math.floor(hash3(x + dx, y + dy, z + dz, 5) * mats.length)]);
  }
}

function wheelbarrow(g, [x, y, z]) {
  // tray (along z), wheel at the front (+z), handles back; full of pumpkins
  g.box([x - 2, y + 2, z - 3], [x + 2, y + 4, z + 3], 'rmLogC');
  g.box([x - 1, y + 3, z - 2], [x + 1, y + 4, z + 2], 0);
  g.box([x - 1, y + 2, z - 2], [x + 1, y + 2, z + 2], 'rmLogA');
  g.box([x, y, z + 4], [x, y + 2, z + 4], 'rmLanternIron'); g.set(x, y + 1, z + 3, 'rmLanternIron'); g.set(x, y + 1, z + 5, 'rmLanternIron');
  for (const dx of [-2, 2]) { g.line([x + dx, y + 3, z - 3], [x + dx, y + 4, z - 7], 'rmBeam'); g.box([x + dx, y, z - 3], [x + dx, y + 1, z - 3], 'rmBeam'); }
  bigPumpkin(g, [x, y + 3, z - 1], 1.8, 'rmPumpkin');
  bigPumpkin(g, [x, y + 4, z + 2], 1.3, 'rmGourdW');
  g.set(x - 1, y + 5, z + 1, 'rmGourdG'); g.set(x + 1, y + 5, z - 2, 'rmGourdY');
}

function shroom(g, [x, y, z], red) {
  g.box([x, y, z], [x, y + 1, z], 'rmMushDot');
  const cap = red ? 'rmMushCap' : 'rmMushTan';
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, y + 2, z + dz, cap);
  g.set(x, y + 3, z, cap);
  if (red) { g.set(x + 1, y + 2, z, 'rmMushDot'); g.set(x, y + 3, z, 'rmMushDot'); }
}

function mossRock(g, [x, y, z], s, seed) {
  const N = noise(seed + 9);
  for (let dy = -1; dy <= s; dy++) for (let dz = -s - 1; dz <= s + 1; dz++) for (let dx = -s - 1; dx <= s + 1; dx++) {
    const d = Math.hypot(dx / (s + 0.5), dy / (s * 0.7), dz / (s + 0.5)) + N.simplex3((x + dx) * 0.3, (y + dy) * 0.3, (z + dz) * 0.3) * 0.25;
    if (d > 1) continue;
    const topish = dy >= s * 0.4;
    g.set(x + dx, y + dy, z + dz, topish && N.simplex3(dx * 0.4, 5, dz * 0.4) > -0.2 ? 'rmMossG' : ['rmStoneA', 'rmStoneC', 'rmStoneB'][Math.floor(hash3(x + dx, y + dy, z + dz) * 3)]);
  }
}

function woodpile(g, [x0, y0, z0]) {
  // split logs stacked between posts, running along z so the end grain faces the viewer (+z), under a lean-to
  const len = 6, cols = 5, rows = 5;
  const z1 = z0 + len - 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols - (r % 2); c++) {
    const x = x0 + 1 + c * 2 + (r % 2), y = y0 + r * 2;
    const m = ['rmLogA', 'rmLogB', 'rmLogC'][(r * 3 + c) % 3];
    g.box([x, y, z0], [x + 1, y + 1, z1], m);
    g.set(x, y, z1, 'rmEnd'); g.set(x + 1, y + 1, z1, 'rmEnd'); g.set(x + 1, y, z1, 'rmEndRing'); g.set(x, y + 1, z1, 'rmEndRing');
  }
  const xw = x0 + cols * 2 + 1;
  for (const x of [x0, xw]) { g.box([x, y0, z1], [x, y0 + 11, z1], 'rmBeam'); g.box([x, y0, z0], [x, y0 + 13, z0], 'rmBeam'); }
  // shingled lean-to, sloping down toward the viewer
  for (let z = z0 - 2; z <= z1 + 2; z++) {
    const y = y0 + 14 - Math.floor((z - z0 + 2) / 2);
    g.box([x0 - 1, y, z], [xw + 1, y, z], (px, py, pz) => (hash3(px, py, pz, 4) < 0.12 ? 'rmLeafO' : hash3(px, py, pz, 6) < 0.1 ? 'rmShingleMoss' : ['rmShingleA', 'rmShingleB', 'rmShingleC'][((px >> 1) + (pz % 2)) % 3]));
  }
  // chopping block with an axe
  const cb = [x0 + 6, y0, z1 + 7];
  g.cylinder(cb, 1.6, 3, 'rmLogB');
  g.disc([cb[0], cb[1] + 2, cb[2]], 1.6, 'rmEnd');
  g.set(cb[0], cb[1] + 2, cb[2], 'rmEndRing');
  g.line([cb[0], cb[1] + 3, cb[2]], [cb[0] - 1, cb[1] + 7, cb[2] + 2], 'rmMantel');
  g.box([cb[0], cb[1] + 3, cb[2] - 1], [cb[0], cb[1] + 4, cb[2]], 'rmIron');
  // a few split pieces on the ground
  g.box([cb[0] - 3, y0, cb[2] + 1], [cb[0] - 3, y0, cb[2] + 3], 'rmLogA'); g.set(cb[0] - 3, y0, cb[2] + 3, 'rmEnd');
  g.box([cb[0] + 2, y0, cb[2] - 2], [cb[0] + 4, y0, cb[2] - 2], 'rmLogC');
}
