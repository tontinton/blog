// Khao Sok — the shared contract every region module builds against (seams, levels, features, life).
// World coords = grid coords, Y up, inclusive ranges. The world is 240 × 240 voxels: x, z ∈ [-120, 119],
// split into 9 regions of 80 × 80 (3 columns by x, 3 rows by z). The camera looks from +x/+z toward −x/−z:
// the +x / +z edges are the FRONT (near the viewer); the NW corner (−x, −z) is the far back (top of screen).
//
//        x: −120…−41          −40…39              40…119
//   z −120…−41  falls (NW)    cave (NC)           towers (NE)      ← back: karst massif, cave ridge, lake towers
//   z  −40…39   river (MW)    giant (MC)          rafts (ME)       ← middle: elephants, the giant tree, raft houses
//   z   40…119  trail (SW)    mouth (SC)          lake (SE)        ← front: forest floor, river mouth, open lake
//
// The ground, the lake and the river are drawn by base.js `ground(g, ctx)` (call it first in every region):
// it is one global deterministic function, so the seams match by construction. Everything else is yours.
import { noise, clamp, smoothstep } from '../lib/index.js';

export const X0 = -120, X1 = 119, Z0 = -120, Z1 = 119;
export const BOTTOM = -14;          // slab bottom (the slab is a crust: hollow inside, full walls on the outer edges)
export const LAKE_Y = 0;            // top water voxel of Cheow Lan lake (raft decks, boats: y = 1)
export const TOP_Y = 150;           // region boxes reach this high (karst summits ≤ ~115, clouds ≤ ~135)

const COLS = [['W', -120, -41], ['C', -40, 39], ['E', 40, 119]];
const ROWS = [['N', -120, -41], ['M', -40, 39], ['S', 40, 119]];
const NAMES = { NW: 'falls', NC: 'cave', NE: 'towers', MW: 'river', MC: 'giant', ME: 'rafts', SW: 'trail', SC: 'mouth', SE: 'lake' };
export const REGIONS = ROWS.flatMap(([r, z0, z1]) => COLS.map(([c, x0, x1]) => ({
  name: NAMES[r + c], cell: r + c, x0, x1, z0, z1, box: [[x0, BOTTOM, z0], [x1, TOP_Y, z1]],
})));
export const region = (name) => REGIONS.find((r) => r.name === name);

// ---- terrain -------------------------------------------------------------------------------------------
const N = noise(1517);

/** Lake shoreline: the lake is where x > shoreX(z) (the east side and, toward the front, the south-east). */
export function shoreX(z) {
  const wob = 6 * Math.sin(z * 0.045 + 1.3) + 3 * N.simplex2(z * 0.03, 4.2);
  const bend = z > 25 ? (z - 25) * 0.62 : 0;                       // bends west toward the front
  return 30 + wob - bend;
}
/** Signed distance-ish to the shore: > 0 on land (voxels west of the shore), < 0 in the lake. */
export const landDist = (x, z) => shoreX(z) - x;
export const isLake = (x, z) => landDist(x, z) < 0;

/** Lake bed top y (sand/silt) for lake columns: shelving down from the shore to ~ −11. */
export function lakeBedY(x, z) {
  const d = -landDist(x, z);
  return Math.round(-1 - clamp((d - 1.5) * 0.4, 0, 9) + N.simplex2(x * 0.06, z * 0.06) * 1.2);   // a shallow shelf, then down
}

// River: from the waterfall plunge pool (falls) south through the elephant pool (river), then east across the
// forest floor (trail → mouth) into the lake. Points are [x, z, halfWidth]; the water surface steps down.
export const RIVER = [
  [-64, -56, 6], [-69, -38, 4], [-74, -18, 5], [-78, -4, 8], [-74, 12, 6], [-66, 30, 4.5],
  [-52, 46, 4.5], [-32, 58, 5], [-12, 68, 6], [6, 74, 8], [22, 78, 10],
];
export const POOL = { x: -64, z: -56, r: 11 };                     // waterfall plunge pool (in falls)
export const POOL_Y = 9;                                           // pool / river source surface (top water voxel)
export const ELEPHANT_POOL = { x: -78, z: -4, r: 9 };              // wide shallow bathing reach (in river)

let RIVER_LEN = 0;
const SEG = RIVER.slice(1).map((b, i) => {
  const a = RIVER[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const s = { a, b, len, s0: RIVER_LEN };
  RIVER_LEN += len;
  return s;
});
export { RIVER_LEN };

/** Nearest point on the river: { d (distance to the centre line), s (arc length), w (half width there), t }. */
export function riverAt(x, z) {
  let best = { d: Infinity, s: 0, w: 4 };
  for (const g of SEG) {
    const [ax, az, aw] = g.a, [bx, bz, bw] = g.b;
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (g.len * g.len), 0, 1);
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, s: g.s0 + t * g.len, w: aw + (bw - aw) * t };
  }
  // meander the banks a little
  best.w += 1.3 * N.simplex2(x * 0.07, z * 0.07);
  if (Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 2) best.w = Math.max(best.w, POOL.r - Math.hypot(x - POOL.x, z - POOL.z) + best.d);
  if (Math.hypot(x - ELEPHANT_POOL.x, z - ELEPHANT_POOL.z) < ELEPHANT_POOL.r) best.w = Math.max(best.w, ELEPHANT_POOL.r * 0.9 + 1.5 * N.simplex2(x * 0.1, z * 0.1));
  return best;
}
/** River water surface (top water voxel) at arc length s: steps down from POOL_Y to LAKE_Y (little rapids). */
export function riverY(s) {
  const f = clamp(s / (RIVER_LEN - 12), 0, 1);
  return Math.round(POOL_Y * (1 - Math.pow(f, 0.85)));
}

/** Natural land height (top voxel) before the river is carved: low shore, rising toward the back-left. */
function hillY(x, z) {
  const inland = clamp(landDist(x, z) / 28, 0, 1);
  const back = smoothstep(-40, 150, -x - z);                        // 0 at the front-right … 1 at the back-left
  const hills = N.fbm2(x * 0.018, z * 0.018, { octaves: 4 }) * 4 + N.ridged2(x * 0.03 + 9, z * 0.03) * 2.5;
  return 1 + inland * (2 + back * 11 + Math.max(0, hills + 1.5));
}

/** Land top y at (x, z) (with the river valley carved in), or null for lake columns. */
export function groundY(x, z) {
  if (isLake(x, z)) return null;
  let h = hillY(x, z);
  const r = riverAt(x, z), wy = riverY(r.s);
  if (r.d < r.w + 10) {                                             // valley: banks slope down to the water
    const k = smoothstep(r.w + 10, r.w + 1, r.d);
    h = h * (1 - k) + (wy + 1) * k;
    h = Math.max(h, wy + 1);
  }
  return Math.max(1, Math.round(h));
}

/** What's at the surface of column (x, z): 'lake' | 'river' | 'land', with its levels. */
export function columnAt(x, z) {
  if (isLake(x, z)) return { kind: 'lake', water: LAKE_Y, bed: lakeBedY(x, z) };
  const r = riverAt(x, z);
  if (r.d <= r.w) {
    const wy = riverY(r.s);
    const edge = 1 - r.d / Math.max(1, r.w);                         // 0 at the bank … 1 mid-stream
    const deep = Math.hypot(x - ELEPHANT_POOL.x, z - ELEPHANT_POOL.z) < ELEPHANT_POOL.r ? 1.5 : Math.hypot(x - POOL.x, z - POOL.z) < POOL.r ? 5 : 2.6;
    const bed = Math.min(wy - 1, Math.round(wy - 0.6 - deep * Math.sqrt(edge)));
    return { kind: 'river', water: wy, bed, s: r.s };
  }
  return { kind: 'land', top: groundY(x, z) };
}
/** Top solid/water y for placing things: land top, or the water surface (rivers, lake). */
export function surfaceY(x, z) { const c = columnAt(x, z); return c.kind === 'land' ? c.top : c.water; }

// ---- big features: where the karsts, the waterfall and the cave are (owners draw them) ---------------------
// base = foot centre [x, y, z] (y = ground or lake bed), r = footprint radius or [rx, rz].
export const KARSTS = [
  // falls built the massif as two towers: main (−68, 6, −100) r [13, 12] h 114 (summit (−73, 114, −104)) + west (−103, 6, −101) r [12, 11] h ~96
  { id: 'massif', owner: 'falls', base: [-68, 6, -100], r: [13, 12], height: 114, profile: 'tower', seed: 11 },
  { id: 'massifWest', owner: 'falls', base: [-103, 6, -101], r: [12, 11], height: 96, profile: 'tower', seed: 12 },
  { id: 'ridge', owner: 'cave', base: [-8, 6, -101], r: [26, 13], height: 66, profile: 'massif', peaks: 2, seed: 7 },   // solid (hollow: false); summits (−27, 72, −104), (5, 57, −107)
  { id: 'brother1', owner: 'towers', base: [70, -9, -96], r: 9 /* leans 0.085 → 142°; summit ~y 94 + snag to 105 */, height: 98, profile: 'tower', seed: 31, water: LAKE_Y },
  { id: 'brother2', owner: 'towers', base: [90, -9, -84], r: 8, height: 84, profile: 'tower', seed: 32, water: LAKE_Y },
  { id: 'brother3', owner: 'towers', base: [104, -9, -102], r: 7.5, height: 72, profile: 'tower', seed: 33, water: LAKE_Y },
  { id: 'islet', owner: 'lake', base: [96, -9, 92], r: 6, height: 24, profile: 'tower', seed: 41, water: LAKE_Y },
];
export const WATERFALL = { lip: [-61, 70, -89], basin: [-62, 9, -72], pool: POOL, width: 5 };   // spring in the main tower's face → 3 cascades → basin → pool
export const CAVE = { mouth: [-4, 16, -86], dir: '+z' };                   // cave mouth in the ridge's front face (floor at ground level)

// ---- shared life: spread these into ctx.emit('actors', { ...LIFE.x, count, area | path | spots }) -------------
// Emits that differ only in area/path/center/radius/count/seed/spots merge into ONE system (one draw call per
// variant for the whole world) — always spread these, never hand-write a variant.
export const LIFE = {
  butterfly: { creature: 'butterfly', variants: 4, behavior: 'wander', altitude: [1.5, 5] },
  walker: { creature: 'walker', options: [{ shirt: '#c94a4a' }, { shirt: '#4a7ac9', hat: '#e8e2d6' }, { shirt: '#5aa86a' }, { shirt: '#e8e2d6', hair: '#1a1a1a' }, { shirt: '#8a5ac0' }] },
  fish: { creature: 'fish', on: 'water', options: [{ color: '#9aa8a0', color2: '#d8e0d8' }, { color: '#6a7a5a', color2: '#c8c09a' }] },
  // add spots / center+radius / area / count / seed only — everything else stays as is so the systems merge
  kingfisher: { creature: 'kingfisher', behavior: 'hop', arc: -0.15, idle: [1.5, 5] },                       // + spots (perches)
  hornbillHop: { creature: 'hornbill', behavior: 'hop', arc: 0.3, idle: [3, 8] },                            // + spots
  hornbillCircle: { creature: 'hornbill', behavior: 'circle', wobble: 1.5 },                                 // + center, radius
  egret: { creature: 'bird', scale: 0.42, behavior: 'hop', arc: 0.3, idle: [5, 12], options: { body: '#f6f5f0', wing: '#f1efe8', tip: '#d8d4c8', beak: '#e8b830' } }, // + spots
  dragonfly: { creature: 'dragonfly', variants: 2, options: [{ color: 'blue' }, { color: 'red' }], behavior: 'wander', altitude: [0.8, 2.2] }, // + area
  birdwing: { creature: 'birdwing', variants: 2, options: [{ kind: 'golden' }, { kind: 'rajah' }], behavior: 'wander', altitude: [2, 6] }, // + area
  monitor: { creature: 'monitor', behavior: 'still' },                                                       // + spots
  macaque: { creature: 'macaque', behavior: 'still', options: { kind: 'longtail' } },                        // + spots
  langur: { creature: 'langur', behavior: 'still' },                                                         // + spots
};

// Camera of the full piece (scene.js) and per-region focus points for solo previews (?region=name).
export const CAMERA = { yaw: 20, pitch: 27 };   // yaw 20: falls + rainbow / the giant / the Three Brothers read as a triad
export const FOCUS = Object.fromEntries(REGIONS.map((r) => [r.name, [(r.x0 + r.x1) / 2, 20, (r.z0 + r.z1) / 2]]));
