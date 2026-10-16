// rafts — building blocks for the raft-house village (regions/rafts.js): a local frame, region materials, thatch roofs,
// little people (kids, swimmers, a napper), boats, fish cages, a swim raft and the floating restaurant.
import { person, spiritHouse, banana, hash3, rng } from '../../lib/index.js';
import { LAKE_Y } from '../layout.js';

export const WY = LAKE_Y;            // top water voxel; decks at WY + 1
export const DY = WY + 1;            // deck voxel row

const DIRS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
const sideOf = (x, z) => (Math.abs(x) >= Math.abs(z) ? (x > 0 ? '+x' : '-x') : z > 0 ? '+z' : '-z');

/** local frame (same as lib/gen/thai.js): v = forward toward `dir`, u = across (to the right), y up from p[1] */
export function frame(g, p, dir = '+z') {
  const [fx, fz] = DIRS[dir], rx = -fz, rz = fx;
  const X = (u, v) => p[0] + fx * v + rx * u, Z = (u, v) => p[2] + fz * v + rz * u;
  const F = {
    at: (u, y, v) => [X(u, v), p[1] + y, Z(u, v)],
    put(u, y, v, m, mode) { if (m) g.put(X(u, v), p[1] + y, Z(u, v), m, mode); },
    set(u, y, v, m) { g.set(X(u, v), p[1] + y, Z(u, v), m ? g.mat(m) : 0); },
    get: (u, y, v) => g.get(X(u, v), p[1] + y, Z(u, v)),
    box(u0, y0, v0, u1, y1, v1, m, mode) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let u = Math.min(u0, u1); u <= Math.max(u0, u1); u++)
        for (let v = Math.min(v0, v1); v <= Math.max(v0, v1); v++) F.put(u, y, v, typeof m === 'function' ? m(u, y, v) : m, mode);
    },
    side: (du, dv) => sideOf(fx * dv + rx * du, fz * dv + rz * du),
    /** build.js person on local cells (u, v) + (u + 1, v), facing local +v (dv = 1) or −v (dv = −1) */
    person(u, y, v, dv, o = {}) {
      const a = F.at(u, y, v), b = F.at(u + 1, y, v);
      person(g, [Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2])], { ...o, side: F.side(0, dv) });
    },
  };
  return F;
}

/** raftHouse geometry in its local frame (mirrors lib/gen/thai.js raftHouse) */
export function houseGeo(o) {
  const w = o.w ?? 7, d = o.d ?? 6, porch = o.porch ?? 6, wallH = o.wallH ?? 6;
  const hu0 = -(w >> 1), hu1 = hu0 + w - 1, uL = hu0 - 1, uR = hu1 + 1;
  const Lr = 1 + d + Math.max(porch, 1), v0 = -(Lr >> 1), v1 = v0 + Lr - 1, hv0 = v0 + 1, hv1 = hv0 + d - 1;
  return { w, d, porch, wallH, hu0, hu1, uL, uR, v0, v1, hv0, hv1, pv: v1, gap: [Math.max(hu0 + 3, hu1 - 3), hu1 - 1], rv0: hv0 - 1, rv1: hv1 + 2 };
}

// ---- region-local materials (prefixed rafts_) ----------------------------------------------------------------
export function materials(P) {
  const add = (n, d) => { if (!P.has(n)) P.add(n, d); };
  add('rafts_foam', { color: '#eef6f2', jitter: 0.03, roughness: 0.6 });
  add('rafts_foamSoft', { color: '#a9dccf', jitter: 0.04, roughness: 0.5 });
  add('rafts_net', { color: '#3c4a3a', jitter: 0.05 });
  add('rafts_flagBlue', { color: '#2c3c8c', jitter: 0.02 });
  add('rafts_cloth', { colors: ['#f2ece0', '#e8e0d0'], jitter: 0.02 });
  add('rafts_clothRed', { color: '#c8423a', jitter: 0.03 });
  add('rafts_wok', { color: '#2a2622', jitter: 0.03, metalness: 0.5, roughness: 0.45 });
  add('rafts_flame', { color: '#ff8a2a', emissive: 5, flicker: 0.6, flickerSpeed: 2.2, light: { color: '#ff9040', radius: 5, intensity: 0.8 } });
  add('rafts_gas', { color: '#c8382a', jitter: 0.03, metalness: 0.3, roughness: 0.5 });
  add('rafts_hat', { color: '#e6cf98', jitter: 0.04 });
  add('rafts_lantern', { color: '#e8402e', emissive: 2.2, light: { color: '#ff7a50', radius: 5, intensity: 0.5 } });
  add('rafts_solar', { color: '#1e2c48', jitter: 0.02, metalness: 0.5, roughness: 0.3, grid: 0.55 });
  add('rafts_tube', { color: '#efe6d2', jitter: 0.03, roughness: 0.6 });
  // muted village clothing: wood + thatch + one warm red-orange accent family
  add('rafts_cream', { color: '#e6dcc4', jitter: 0.03 });
  add('rafts_khaki', { color: '#a89470', jitter: 0.04 });
  add('rafts_rust', { color: '#b45a36', jitter: 0.04 });
  add('rafts_indigo', { color: '#4c5a74', jitter: 0.04 });
  add('rafts_brown', { color: '#7a5a40', jitter: 0.04 });
  add('rafts_shorts', { color: '#3c3a38', jitter: 0.04 });
  add('rafts_curry', { color: '#e0a030', jitter: 0.05 });
  add('rafts_greens', { color: '#4e9a3a', jitter: 0.05 });
  add('rafts_rice', { color: '#f4f0e4', jitter: 0.02 });
  add('rafts_chili', { color: '#d8302a', jitter: 0.04 });
  add('rafts_bougain', { colors: ['#d8308a', '#e04a9a', '#c02878'], jitter: 0.05, sway: 0.3 });
  add('rafts_mango', { colors: ['#f0b030', '#e89a28', '#d8c040'], jitter: 0.04 });
  add('rafts_rambutan', { colors: ['#d02a3a', '#e0403a'], jitter: 0.04 });
  add('rafts_robe', { color: '#e0761a', jitter: 0.04 });
  add('rafts_robeDark', { color: '#b85a14', jitter: 0.04 });
  add('rafts_line', { color: '#d8d4c8', jitter: 0.02 });
  add('rafts_mossThatch', { colors: ['#5f6e34', '#6a7a3a', '#56652e'], jitter: 0.06 });
  add('rafts_lichen', { color: '#a8a070', jitter: 0.06 });
  add('rafts_fish', { color: '#c8d0cc', jitter: 0.05, metalness: 0.3, roughness: 0.4 });
  add('rafts_banana', { colors: ['#e8d040', '#d8c838', '#b8c040'], jitter: 0.04 });
  // one golden atap tone for every thatched roof: base + a slightly darker streak running down the slope, dark ridge cap
  add('rafts_thatchGold', { color: '#b38c52', jitter: 0.06, noise: { color: '#9f7a46', scale: 0.3, amount: 0.45 } });
  add('rafts_thatchStreak', { color: '#9e7944', jitter: 0.06 });
  add('rafts_thatchCap', { color: '#5f4a30', jitter: 0.05 });
  add('rafts_hullDark', { color: '#3b2a1e', jitter: 0.04 });
  add('rafts_sash', { color: '#c0601a', jitter: 0.03 });
}

// ---- small helpers ----------------------------------------------------------------------------------------
// (palette.def(id).kind is numeric; the authored kind lives in .src)
export const isWater = (g, x, y, z) => { const id = g.get(x, y, z); return !!id && g.palette.def(id)?.src?.kind === 'water'; };

const GOLD = ['rafts_thatchGold', 'rafts_thatchStreak', 'rafts_thatchCap'];
/** atap shade for a top cell: streaks run down the slope (constant along the ridge direction), a few voxels darker */
const atap = (along, seed) => (hash3(along, 0, 7, seed) < 0.28 ? GOLD[1] : GOLD[0]);

/**
 * Thatched roof over a rectangle: gable (ridge along `axis`) or hip (`cap` = rows from the eave: a skirt). One golden tone
 * with streaks running down the slope, a dark underside and ridge cap, a ragged eave fringe (every other eave voxel drops 1).
 */
export function thatchRoof(g, x0, z0, x1, z1, y, o = {}) {
  const axis = o.axis ?? (x1 - x0 >= z1 - z0 ? 'x' : 'z'), slope = o.slope ?? 1, th = o.thick ?? 2, hip = o.type === 'hip';
  const seed = o.seed ?? 1, cap = o.cap ?? Infinity;
  const E = (x, z) => { const dx = Math.min(x - x0, x1 - x), dz = Math.min(z - z0, z1 - z); return hip ? Math.min(dx, dz) : axis === 'x' ? dz : dx; };
  const along = (x, z) => (hip ? (Math.min(x - x0, x1 - x) <= Math.min(z - z0, z1 - z) ? z : x) : axis === 'x' ? x : z);
  let eMax = 0;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) eMax = Math.max(eMax, Math.min(cap, E(x, z)));
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const e = Math.min(cap, E(x, z)), top = y + Math.floor(e * slope + 1e-6), a = along(x, z);
    for (let yy = Math.max(y, top - th + 1); yy <= top; yy++)
      g.put(x, yy, z, e === eMax && !hip ? GOLD[2] : yy !== top ? GOLD[1] : atap(a, seed), o.mode);
    if (e === 0 && (a & 1)) g.put(x, y - 1, z, atap(a, seed + 1), 'keep');                      // ragged eave fringe
  }
  return y + Math.floor(eMax * slope + 1e-6);
}

/**
 * Re-thatch a lib raftHouse roof in its local frame (F, geo from houseGeo): one golden tone, streaks down the slope, a dark
 * ridge cap + underside, and a regular ragged fringe along both eaves. Keeps the roof's shape (the A-frame rhythm) exactly.
 */
export function thatchHouseRoof(g, F, geo, seed = 1) {
  const old = new Set(['thatchPalm', 'thatchPalmLight', 'thatchPalmDark'].map((m) => g.mat(m)));
  const ru0 = geo.hu0 - 2, ru1 = geo.hu1 + 2, rv0 = geo.hv0 - 1, rv1 = geo.hv1 + (geo.porch ? 2 : 1), eaveY = geo.wallH;
  const eMax = Math.floor((ru1 - ru0) / 2);
  for (let u = ru0; u <= ru1; u++) for (let v = rv0; v <= rv1; v++) {
    const e = Math.min(u - ru0, ru1 - u), top = eaveY + Math.floor(e * 1.5 + 1e-6);
    for (let y = top - 1; y <= top + (e === eMax ? 1 : 0); y++) {
      if (!old.has(F.get(u, y, v))) continue;
      F.set(u, y, v, e === eMax ? GOLD[2] : y !== top ? GOLD[1] : atap(v, seed));
    }
  }
  for (const u of [ru0, ru1]) for (let v = rv0; v <= rv1; v++) {                                    // fringe: every other eave voxel drops 1
    const cur = F.get(u, eaveY - 1, v);
    if (cur && !old.has(cur)) continue;
    F.set(u, eaveY - 1, v, (v & 1) ? atap(v, seed + 1) : 0);
  }
}

/** a small kid (5 tall): shorts, shirt, head; pose 'stand' | 'jump' (arms up) */
export function kid(g, p, side, o = {}) {
  const F = frame(g, p, side), R = rng(o.seed ?? 1);
  const shirt = o.shirt ?? R.pick(['rafts_cream', 'rafts_rust', 'rafts_khaki', 'rafts_indigo']);
  const sk = g.palette.color(o.skin ?? '#b07850'), hr = g.palette.color('#1e1612');
  const jump = o.pose === 'jump';
  for (const u of [0, 1]) {
    F.put(u, 0, 0, jump ? sk : (o.shorts ?? 'rafts_shorts'));
    F.put(u, 1, 0, o.shorts ?? 'rafts_shorts'); F.put(u, 2, 0, shirt);
    F.put(u, 3, 0, sk); F.put(u, 4, 0, hr); F.put(u, 3, -1, hr);
  }
  if (jump) for (const u of [-1, 2]) { F.put(u, 3, 0, sk); F.put(u, 4, 0, sk); }
  else { F.put(-1, 2, 0, sk); F.put(2, 2, 0, sk); }
}

/** swimmer: head (+ a waving arm) above the water, shoulders + body faint below it, a soft ripple ring */
export function swimmer(g, p, side, o = {}) {
  const F = frame(g, p, side), seed = o.seed ?? 3, R = rng(seed);
  const sk = g.palette.color(o.skin ?? R.pick(['#c08a60', '#a87450', '#e0b090'])), hr = g.palette.color(o.hair ?? '#1e1612');
  for (const u of [0, 1]) { F.set(u, 1, 0, sk); F.set(u, 2, 0, hr); F.set(u, 1, -1, hr); F.set(u, 0, 0, sk); F.set(u, -1, 0, o.shirt ?? 'rafts_rust'); F.set(u, -2, 0, o.shirt ?? 'rafts_rust'); }
  if (o.wave) { F.set(2, 0, 0, sk); F.set(2, 1, 0, sk); F.set(2, 2, 0, sk); F.set(2, 3, 0, sk); }
  else { F.set(-1, 0, 1, sk); F.set(2, 0, -1, sk); }
  ripples(g, F, seed);
}
function ripples(g, F, seed) {
  for (const [u, v] of [[-1, -1], [2, 1], [-2, 0], [3, 0], [0, 2], [1, -2], [-1, 1], [2, -1], [0, -2], [1, 2]]) {
    const [x, y, z] = F.at(u, 0, v);
    if (hash3(u, v, 7, seed) < 0.75 && isWater(g, x, y, z)) g.set(x, y, z, g.mat('rafts_foamSoft'));
  }
}

/** splash ring on the water surface around (x, z), droplets above */
export function splash(g, x, z, r = 2, seed = 1) {
  for (let dx = -r - 1; dx <= r + 1; dx++) for (let dz = -r - 1; dz <= r + 1; dz++) {
    const d = Math.hypot(dx, dz);
    if (d > r + 0.9 || !isWater(g, x + dx, WY, z + dz)) continue;
    if (d > r - 0.6) g.set(x + dx, WY, z + dz, g.mat(hash3(dx, dz, 1, seed) < 0.6 ? 'rafts_foam' : 'rafts_foamSoft'));
    else if (d < 1.2) g.set(x + dx, WY, z + dz, g.mat('rafts_foam'));
  }
  for (const [dx, dy, dz] of [[0, 1, 0], [1, 1, 0], [0, 2, 1], [-1, 2, 0], [1, 3, -1], [-2, 1, 1], [2, 2, 1], [0, 1, -1]]) if (hash3(dx, dz, dy, seed) < 0.8) g.set(x + dx, WY + dy, z + dz, g.mat('rafts_foam'));
}

/** potted plant on a deck: clay pot + a leafy top ('leaf' | 'tall'), or bougainvillea ('bougain', the restaurant's two only) */
export function potPlant(g, x, y, z, R, kind) {
  g.set(x, y, z, g.mat('thaiClay'));
  const k = kind ?? R.pick(['leaf', 'tall']);
  if (k === 'tall') { g.set(x, y + 1, z, g.mat('leafDark')); g.set(x, y + 2, z, g.mat('leaf')); g.set(x, y + 3, z, g.mat('leafLight')); }
  else {
    g.set(x, y + 1, z, g.mat(k === 'bougain' ? 'rafts_bougain' : 'leaf'));
    g.set(x, y + 2, z, g.mat(k === 'bougain' ? 'rafts_bougain' : 'leafLight'));
  }
}

/** hanging lantern: `drop` voxels of cord under (x, y, z), then the lantern */
export function hangLantern(g, x, y, z, m = 'lanternGlow', drop = 1) {
  for (let k = 1; k <= drop; k++) g.set(x, y - k, z, g.mat('fiberRope'));
  g.set(x, y - drop - 1, z, g.mat(m));
}

/** lantern post: a bamboo post with an arm and a hanging lantern (arm toward (ax, az)) */
export function lanternPost(g, x, z, ax = 0, az = 0, h = 6) {
  for (let y = DY + 1; y <= DY + h; y++) g.set(x, y, z, g.mat(y === DY + h ? 'bambooPoleDark' : 'bambooPole'));
  g.set(x + ax, DY + h, z + az, g.mat('bambooPoleDark'));
  g.set(x + ax, DY + h - 1, z + az, g.mat('lanternGlow'));
}

/** small wooden rowing boat (sampan) along `dir`; returns its frame (local y 0 = gunwale-1, y 1 = rim / seat level) */
export function rowboat(g, p, dir, o = {}) {
  const F = frame(g, p, dir), half = o.half ?? 6;
  for (let v = -half; v <= half; v++) {
    const narrow = Math.abs(v) >= half - 1, ua = narrow ? -1 : -2, ub = narrow ? 0 : 1;
    for (let u = ua; u <= ub; u++) {
      const rim = u === ua || u === ub || Math.abs(v) === half;
      F.set(u, 0, v, rim ? (o.hull ?? 'longtailHull') : 'plankDark');
      F.set(u, -1, v, o.keel ?? 'longtailHullDark');
      if (rim) F.set(u, 1, v, Math.abs(v) >= half - 1 ? (o.dark ?? 'longtailHullDark') : (o.hull ?? 'longtailHull'));
    }
  }
  for (const v of [-half - 1, half + 1]) for (const u of [-1, 0]) F.set(u, 1, v, o.dark ?? 'longtailHullDark');
  return F;
}

/** floating fish cage: a square bamboo frame on floats, a dark net hanging into the water */
export function fishCage(g, x0, z0, n) {
  const x1 = x0 + n - 1, z1 = z0 + n - 1;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    if (edge) { g.set(x, DY, z, g.mat((x + z) & 1 ? 'bambooPole' : 'bambooPoleDark')); g.set(x, WY, z, g.mat('raftFloat')); }
    else g.set(x, WY - 3, z, g.mat('rafts_net'));
  }
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) g.set(x, DY + 1, z, g.mat('beam'));
  for (let x = x0 + 1; x < x1; x++) for (const z of [z0 + 1, z1 - 1]) for (let y = WY - 3; y <= WY - 1; y++) g.set(x, y, z, g.mat('rafts_net'));
  for (let z = z0 + 1; z < z1; z++) for (const x of [x0 + 1, x1 - 1]) for (let y = WY - 3; y <= WY - 1; y++) g.set(x, y, z, g.mat('rafts_net'));
}

/** swim raft: a little floating platform (x0…x0+5, z0…z0+5), a diving board toward +x, a ladder on the south side,
 * towels and a red-and-white parasol */
export function swimRaft(g, x0, z0) {
  for (let x = x0; x <= x0 + 5; x++) for (let z = z0; z <= z0 + 5; z++) {
    const edge = x === x0 || x === x0 + 5 || z === z0 || z === z0 + 5;
    g.set(x, DY, z, g.mat(edge ? 'plankDark' : (z & 1) ? 'plank' : 'plankLight'));
    g.set(x, WY, z, g.mat((x + z) & 1 ? 'raftFloat' : 'raftFloatDark'));
  }
  for (let x = x0 + 3; x <= x0 + 8; x++) for (const z of [z0 + 2, z0 + 3]) g.set(x, DY + 2, z, g.mat('plankLight'));
  for (const z of [z0 + 2, z0 + 3]) g.set(x0 + 3, DY + 1, z, g.mat('beam'));
  for (const x of [x0 + 1, x0 + 3]) for (let y = WY - 2; y <= DY + 2; y++) g.set(x, y, z0 + 6, g.mat('metal'));
  g.set(x0 + 2, WY - 1, z0 + 6, g.mat('metal')); g.set(x0 + 2, DY, z0 + 6, g.mat('metal'));
  for (let x = x0 + 1; x <= x0 + 2; x++) for (let z = z0 + 3; z <= z0 + 4; z++) g.set(x, DY + 1, z, g.mat(z === z0 + 3 ? 'rafts_cream' : 'rafts_rust'));
  const px = x0 + 1, pz = z0 + 1;
  for (let y = DY + 1; y <= DY + 6; y++) g.set(px, y, pz, g.mat('metal'));
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) + Math.abs(dz) <= 3)
    g.set(px + dx, DY + 6 + (Math.abs(dx) + Math.abs(dz) <= 1 ? 1 : 0), pz + dz, g.mat(((dx + dz) & 1) ? 'templeWhite' : 'templeRed'));
}

export const CLOTHES = ['rafts_cream', 'rafts_rust', 'rafts_khaki', 'rafts_indigo', 'rafts_brown', 'rafts_cream'];

/** 2×2×2 rattan takraw ball with its min corner at (x, y, z): light and dark rattan alternating like the weave */
export function takrawBall(g, x, y, z) {
  for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) for (let dz = 0; dz <= 1; dz++)
    g.set(x + dx, y + dy, z + dz, g.mat((dx + dy + dz) & 1 ? 'bambooPoleDark' : 'bambooPole'));
}

/** a kid tucked into a cannonball (about 3×3×3, min corner x, y, z; the camera face is +z): rust shorts below, knees and
 * hugging arms in front, a round head with the hair on top and at the back */
export function cannonball(g, x, y, z) {
  const sk = g.palette.color('#c08a62'), knee = g.palette.color('#d09a70'), arm = g.palette.color('#9c6844'), hr = g.palette.color('#1e1612');
  const S = (dx, dy, dz, m) => g.set(x + dx, y + dy, z + dz, typeof m === 'string' ? g.mat(m) : m);
  for (let dx = 0; dx <= 2; dx++) for (let dz = 0; dz <= 2; dz++) if (!((dx === 0 || dx === 2) && dz === 0)) S(dx, 0, dz, 'rafts_rust');   // seat (rounded)
  for (let dx = 0; dx <= 2; dx++) for (let dz = 0; dz <= 2; dz++) S(dx, 1, dz, dz === 2 ? (dx === 1 ? arm : knee) : sk);   // knees, arms hugging them
  S(1, 2, 2, sk); S(1, 2, 1, sk); S(0, 2, 1, arm); S(2, 2, 1, arm); S(1, 2, 0, hr); S(1, 3, 1, hr); S(1, 3, 0, hr);        // head tucked down, hair
}

/** a flat ring of foam replacing the surface water around (x, z) — a splash seen from above */
export function foamRing(g, x, z, r = 2) {
  for (let dx = -r - 1; dx <= r + 1; dx++) for (let dz = -r - 1; dz <= r + 1; dz++) {
    const d = Math.hypot(dx, dz);
    if (d > r + 0.7 || (d > 0.8 && d < r - 0.6) || !isWater(g, x + dx, WY, z + dz)) continue;
    g.set(x + dx, WY, z + dz, g.mat('rafts_foam'));
  }
}

/** a young takraw player (7 tall) at p facing `side`; kick: the far leg swung up to hip height (bicycle kick), arms out */
export function player(g, p, side, o = {}) {
  const F = frame(g, p, side), sk = g.palette.color(o.skin ?? '#a8724a'), hr = g.palette.color('#1a1410');
  const shirt = o.shirt ?? 'rafts_rust', pants = o.pants ?? 'rafts_shorts';
  for (const u of [0, 1]) {
    if (!(o.kick && u === 1)) { F.put(u, 0, 0, sk); F.put(u, 1, 0, pants); }
    F.put(u, 2, 0, shirt); F.put(u, 3, 0, shirt); F.put(u, 4, 0, sk); F.put(u, 5, 0, sk); F.put(u, 6, 0, hr); F.put(u, 5, -1, hr);
  }
  if (o.kick) { F.put(1, 2, 1, pants); F.put(1, 2, 2, pants); F.put(1, 2, 3, sk); }       // the kicking leg, horizontal at hip height
  if (o.kick || o.ready) for (const u of [-1, 2]) { F.put(u, 3, 0, shirt); F.put(u, 3, o.kick ? 0 : 1, sk); }   // arms out for balance
  else { F.put(-1, 3, 0, shirt); F.put(2, 3, 0, shirt); F.put(-1, 2, 0, sk); F.put(2, 2, 0, sk); }
}

/** conical straw hat (ngob) on a build.js person standing / sitting at p facing `side` */
export function hat(g, p, side, sit) {
  const alongX = side === '+z' || side === '-z', y = p[1] + (sit ? 5 : 6), m = g.mat('rafts_hat');
  for (let a = -1; a <= 2; a++) for (let d = -1; d <= 1; d++) if (Math.abs(a - 0.5) + Math.abs(d) < 2.6)
    g.set(p[0] + (alongX ? a : d), y, p[2] + (alongX ? d : a), m);
  for (const a of [0, 1]) g.set(p[0] + (alongX ? a : 0), y + 1, p[2] + (alongX ? 0 : a), m);
}

// ---- the floating restaurant (village hub) -----------------------------------------------------------------
// deck x0…x1, z0…z1 (y = DY); the shore walkway lands on the west rim, the boardwalk runs past the east rim. A dining hall
// under a fresh two-tier thatch roof (gables facing ±x, the east one carved with a bamboo sunburst), an open kitchen on the
// boardwalk side (the cook at a flaming wok), a spirit house by the landing, a Thai flag, red lanterns along the eaves.
export function restaurant(g, ctx, R, B) {
  const { x0, x1, z0, z1 } = B;
  const P = (x, y, z, m) => g.set(x, y, z, m ? g.mat(m) : 0);
  // floats: blue barrels in rows under the deck, bamboo bundles around the rim
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const k = (x - x0) % 4, row = (z - z0) % 3;
    if (k !== 3 && row !== 2) P(x, WY, z, row === 0 ? 'raftFloat' : 'raftFloatDark');
  }
  for (let x = x0 - 1; x <= x1 + 1; x++) for (const z of [z0 - 1, z1 + 1]) { P(x, WY, z, (x & 3) === 0 ? 'bambooPoleDark' : 'bambooPole'); P(x, WY - 1, z, 'bambooPoleDark'); }
  for (let z = z0; z <= z1; z++) for (const x of [x0 - 1, x1 + 1]) { P(x, WY, z, (z & 3) === 0 ? 'bambooPoleDark' : 'bambooPole'); P(x, WY - 1, z, 'bambooPoleDark'); }
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const rim = x === x0 || x === x1 || z === z0 || z === z1;
    P(x, DY, z, rim ? 'plankDark' : hash3(x >> 3, z, 2, 5) < 0.12 ? 'plankDark' : (z & 1) ? 'plank' : 'plankLight');
  }

  // ---- roof: posts, a lower hip skirt + a tall upper gable with its ridge along x
  const hx0 = x0 + 2, hx1 = x1, hz0 = z0, hz1 = z1, eave = DY + 8;
  const posts = [];
  for (const x of [hx0, Math.round((hx0 + hx1) / 2), hx1]) for (const z of [hz0 + 1, hz1 - 1]) posts.push([x, z]);
  for (const [x, z] of posts) for (let y = DY + 1; y < eave; y++) P(x, y, z, y === eave - 1 ? 'beam' : 'bambooPoleDark');
  for (let x = hx0; x <= hx1; x++) for (const z of [hz0 + 1, hz1 - 1]) P(x, eave - 1, z, 'beam');
  for (let z = hz0 + 1; z <= hz1 - 1; z++) for (const x of [hx0, hx1]) P(x, eave - 1, z, 'beam');
  thatchRoof(g, hx0 - 2, hz0 - 1, hx1, hz1 + 1, eave, { type: 'hip', slope: 1, cap: 3, seed: 21 });   // east eave stops over the deck edge: headroom on the boardwalk
  const ux0 = hx0 + 1, ux1 = hx1 - 1, uz0 = hz0 + 2, uz1 = hz1 - 2, uy = eave + 3;
  const ridge = thatchRoof(g, ux0, uz0, ux1, uz1, uy, { axis: 'x', slope: 1.5, thick: 2, seed: 22 });
  const cz = (uz0 + uz1) / 2, rz = Math.round(cz);
  // gable walls (woven bamboo with a sunburst of dark slats) at both ends, ridge roll, kalae horns at the apexes
  for (const x of [ux0 + 1, ux1 - 1]) for (let z = uz0 + 1; z <= uz1 - 1; z++) {
    const e = Math.min(z - uz0, uz1 - z), top = uy + Math.floor(e * 1.5 + 1e-6) - 2;
    for (let y = eave; y <= top; y++) {
      const ang = Math.atan2(y - eave + 0.5, z - cz), ray = Math.abs((((ang / Math.PI) * 9) % 1) - 0.5) < 0.14;
      P(x, y, z, y === eave ? 'beam' : ray ? 'bambooPoleDark' : ((z + y) & 3) < 2 ? 'bambooMat' : 'bambooMatDark');
    }
  }
  for (let x = ux0; x <= ux1; x++) P(x, ridge + 1, rz, (x - ux0) % 3 === 0 ? 'bambooPoleDark' : 'rafts_thatchCap');
  for (const [x, s] of [[ux0, -1], [ux1, 1]]) {
    for (const k of [1, 2]) { P(x + s, ridge + k, rz - k, 'beam'); P(x + s, ridge + k, rz + k, 'beam'); }
    P(x + s, ridge + 3, rz - 3, 'templeGold'); P(x + s, ridge + 3, rz + 3, 'templeGold');
  }
  // lanterns: red ones along the south + east eaves, warm ones over the tables
  for (let x = hx0; x <= hx1; x += 3) hangLantern(g, x, eave, hz1 + 1, 'rafts_lantern');
  for (let z = hz0 + 2; z <= hz1 - 2; z += 3) hangLantern(g, hx1, eave, z, 'rafts_lantern');

  // ---- three tables with diners, warm lamps over them; a waiter with a tray
  const tables = [[x0 + 5, z0 + 2], [x0 + 11, z0 + 2], [x0 + 5, z0 + 9]];
  tables.forEach(([tx, tz], i) => {
    for (let x = tx; x <= tx + 3; x++) for (let z = tz; z <= tz + 1; z++) P(x, DY + 3, z, i === 1 ? 'rafts_cloth' : 'rafts_clothRed');
    for (const x of [tx, tx + 3]) for (let y = DY + 1; y <= DY + 2; y++) P(x, y, tz, 'plankDark');
    for (let x = tx; x <= tx + 3; x++) { P(x, DY + 1, tz - 2, 'plankDark'); P(x, DY + 1, tz + 3, 'plankDark'); }
    const dishes = ['rafts_rice', 'rafts_curry', 'rafts_greens', 'rafts_chili', 'rafts_rice', 'sodaRed'];
    [[tx, tz], [tx + 1, tz + 1], [tx + 2, tz], [tx + 3, tz + 1]].forEach(([x, z], k) => P(x, DY + 4, z, dishes[(k + i) % dishes.length]));
    const seats = [[tx, tz - 2, '+z'], [tx + 2, tz + 3, '-z'], [tx + 2, tz - 2, '+z']].slice(0, [2, 3, 2][i]);
    seats.forEach(([x, z, side], k) => person(g, [x, DY + 2, z], { pose: 'sit', side, seed: 100 + i * 7 + k, shirt: CLOTHES[(i * 3 + k) % CLOTHES.length], pants: 'rafts_shorts' }));
    hangLantern(g, tx + 2, uy + 1, tz + 1, 'lanternGlow', uy - DY - 9);
  });
  person(g, [x0 + 10, DY + 1, z0 + 8], { side: '-x', seed: 211, shirt: 'rafts_cloth' });
  P(x0 + 9, DY + 4, z0 + 8, 'plankLight'); P(x0 + 9, DY + 5, z0 + 8, 'rafts_curry'); P(x0 + 9, DY + 4, z0 + 9, 'plankLight'); P(x0 + 9, DY + 5, z0 + 9, 'rafts_rice');

  // ---- open kitchen on the boardwalk side (SE corner): counter along x1 - 1, the cook behind it facing +x
  const kz0 = z1 - 6, kz1 = z1 - 1, kx = x1 - 1;
  for (let z = kz0; z <= kz1; z++) { P(kx, DY + 1, z, 'plankDark'); P(kx, DY + 2, z, 'plankDark'); P(kx, DY + 3, z, 'plankLight'); }
  P(kx, DY + 4, kz0 + 2, 'rafts_flame'); P(kx, DY + 4, kz0 + 1, 'metalDark'); P(kx, DY + 4, kz0 + 3, 'metalDark');
  for (const dz of [1, 2, 3]) P(kx, DY + 5, kz0 + dz, 'rafts_wok');
  P(kx, DY + 6, kz0 + 2, 'rafts_chili'); P(kx, DY + 4, kz0 + 4, 'rafts_rice'); P(kx, DY + 4, kz1, 'thaiClay'); P(kx, DY + 5, kz1, 'rafts_greens');
  person(g, [kx - 2, DY + 1, kz0 + 2], { side: '+x', seed: 77, shirt: 'rafts_cloth', hat: 'rafts_cloth', pose: 'wave' });
  for (let z = kz0; z <= kz1; z++) { P(kx - 4, DY + 1, z, 'plankDark'); P(kx - 4, DY + 2, z, 'plankDark'); P(kx - 4, DY + 3, z, R.pick(['rafts_curry', 'sodaRed', 'glass', 'rafts_chili', 'rafts_greens', 'thaiClay'])); }
  P(kx - 3, DY + 1, kz1, 'rafts_gas'); P(kx - 3, DY + 2, kz1, 'rafts_gas');
  for (let y = DY + 1; y <= DY + 3; y++) P(kx - 3, y, kz0, y === DY + 3 ? 'stoneDark' : 'thaiClay');
  for (let z = kz0; z <= kz1; z += 2) hangLantern(g, kx - 2, eave - 1, z, 'rafts_wok', 0);

  // ---- spirit house in the NW corner, plants (two bougainvillea pots by the south steps), a banana in a pot
  spiritHouse(g, [x0 + 2, DY + 1, z0 + 2], { side: '+x', pillar: 2, table: false, seed: 4 });
  for (const [x, z, k] of [[x0, z1, 'bougain'], [x0 + 3, z1, 'bougain'], [x1, z0 + 2, 'tall'], [x0 + 15, z0, 'leaf']]) potPlant(g, x, DY + 1, z, R, k);
  P(x0 + 1, DY + 1, z1 - 1, 'thaiClay');
  banana(g, [x0 + 1, DY + 2, z1 - 1], { height: 3, leaves: 5, length: 4, fruit: true, seed: 8 });

  // ---- Thai flag on a tall bamboo pole at the SE corner (flies south, clear of the gable)
  const fx = x1, fz = z1, top = DY + 23;
  for (let y = DY + 1; y <= top; y++) P(fx, y, fz, y === top ? 'templeGold' : 'bambooPoleDark');
  const stripes = ['templeRed', 'templeWhite', 'rafts_flagBlue', 'rafts_flagBlue', 'templeWhite', 'templeRed'];
  for (let r = 0; r < 6; r++) for (let k = 1; k <= 9; k++) P(fx + Math.round(Math.sin(k * 0.7) * 0.6), top - 1 - r - (k > 6 ? 1 : 0), fz + k, stripes[r]);
  return { ridge, eave, kitchen: [kx, DY + 1, kz0 + 2] };
}
