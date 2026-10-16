// mouth (SC: x −40…39, z 40…119) — where the river meets Cheow Lan lake.
//
// Stories (front → back): a cast-net fisherman out on the lake; a sand spit closing a calm lotus lagoon (egrets wading,
// terrapins on a sunk branch, dragonflies, water monitors) with a fishermen's camp on its shore (breakfast fire,
// fish drying); the mouth bar where smooth-coated otters play over their catch while the family swims round it; the
// landing: a bamboo jetty with a ribboned mooring pole (Mae Ya Nang), a long-tail being loaded with supplies for the raft
// houses across the lake (the boat dog on its bow), two long-tails pulled up on the beach, a boat shed, a spirit house;
// grey drowned snags with kingfishers and egrets; upriver a sagging rope bridge over a boulder rapid between bamboo groves.
//
// Order: ground → reshape the lake bed (bar, spit, lagoon) + foam → repaint clearings/paths → structures (landing,
// bridge, camp) → forest (rainforest on the untouched floor) → bamboo/bananas/understory → trim the paths → water
// plants → dead trees → fisherman → static egrets → actors + POIs → trim the jungle seams.
import { ground } from '../base.js';
import { LAKE_Y, LIFE, columnAt, riverAt, landDist } from '../layout.js';
import {
  rng, hash3, clamp, spline, rainforest, bamboo, banana, deadTree, lilyPads, lotus, undergrowth, longtail, spiritHouse, ropeBridge, person,
  campfire, rock,
} from '../../lib/index.js';

// ---- region-local materials ---------------------------------------------------------------------------------
const MATS = {
  mouth_grass: { colors: ['#6f8e36', '#78963c', '#668632'], jitter: 0.05, noise: { color: '#5a7a2e', scale: 0.14, amount: 0.55 } },
  mouth_grassDry: { colors: ['#9c9a52', '#a8a45a', '#908e4a'], jitter: 0.05 },
  mouth_path: { colors: ['#9a7a54', '#a6845c', '#8e704c'], jitter: 0.05 },
  mouth_wetSand: { colors: ['#a8946a', '#b09c70', '#a08c62'], jitter: 0.04 },
  mouth_sandDry: { colors: ['#e2d2a6', '#dccb9c', '#e8dab2'], jitter: 0.04 },
  mouth_gravel: { colors: ['#9a9284', '#b2aa9a', '#857e72', '#c6beac'], jitter: 0.06 },
  mouth_foam: { color: '#eef8f4', jitter: 0.03, roughness: 0.5 },
  mouth_reed: { color: '#7a9c3a', jitter: 0.06, sway: 0.7 },
  mouth_reedDark: { color: '#587a2c', jitter: 0.06, sway: 0.6 },
  mouth_reedDry: { color: '#b4a464', jitter: 0.06, sway: 0.7 },
  mouth_cattail: { color: '#6a4228', jitter: 0.05, sway: 0.7 },
  mouth_egret: { color: '#f7f6f1', jitter: 0.02, roughness: 0.6 },
  mouth_egretLeg: { color: '#23201c', jitter: 0.02 },
  mouth_egretBill: { color: '#e8b830', jitter: 0.02 },
  mouth_net: { color: '#cfc8b4', jitter: 0.04 },
  mouth_weight: { color: '#5c5a54', jitter: 0.03, metalness: 0.3, roughness: 0.5 },
  mouth_otterFur: { color: '#4a2e1c', jitter: 0.04, roughness: 0.45 },
  mouth_otterThroat: { color: '#d8c6a2', jitter: 0.03 },
  mouth_otterNose: { color: '#17110f' },
  mouth_rice: { color: '#eeeae0', jitter: 0.03, grid: 0.25 },
  mouth_hessian: { colors: ['#a88a5a', '#9c7e50'], jitter: 0.05 },
  mouth_ice: { color: '#d4eef6', kind: 'glass', opacity: 0.3 },
  mouth_crate: { color: '#2f6fb8', jitter: 0.03, grid: 0.35 },
  mouth_snag: { color: '#a9a59b', jitter: 0.05 },
  mouth_snagDark: { color: '#7e7a72', jitter: 0.05 },
  mouth_bambooPale: { color: '#d6c286', jitter: 0.05 },
  mouth_fishSilver: { color: '#c4ccd2', jitter: 0.04, metalness: 0.3, roughness: 0.4 },
  mouth_shell: { color: '#4a4a2c', jitter: 0.05 },
  mouth_shellHi: { color: '#6a6436', jitter: 0.05 },
  mouth_turtleSkin: { color: '#5a5e3a', jitter: 0.04 },
};

const FLOOR = ['floor', 'floorLitter', 'floorMoss'];

// ---- geometry helpers -----------------------------------------------------------------------------------------
/** distance from (x, z) to a polyline of [x, z] points → { d, s (0..1 along it), i } */
function polyDist(pts, x, z) {
  let best = { d: Infinity, s: 0 }, acc = 0;
  const lens = pts.slice(1).map((b, i) => Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1])), L = lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best.d) best = { d, s: (acc + t * lens[i]) / L };
    acc += lens[i];
  }
  return best;
}
const smooth2 = (pts, steps = 6) => spline(pts.map(([x, z]) => [x, 0, z]), steps).map(([x, , z]) => [x, z]);

// The delta: the mouth bar (otters), the spit that closes the lagoon, and the lagoon itself.
const MOUTH = [-3, 70];
const BAR = { c: [9, 75.5], axis: [0.9, 0.44], a: 9, b: 3.1 };
const SPIT = smooth2([[-7.5, 76.5], [-2.5, 80], [1.5, 85.5], [2.2, 91.5], [-1, 97.5], [-7.5, 102], [-14.5, 104.5]], 8);
const spitX = (z) => {                                   // spit centre-line x at z (the spit runs monotonically in z)
  for (let i = 0; i < SPIT.length - 1; i++) {
    const [ax, az] = SPIT[i], [bx, bz] = SPIT[i + 1];
    if (z >= az && z <= bz) return ax + (bx - ax) * ((z - az) / (bz - az || 1));
  }
  return null;
};
const inLagoon = (x, z) => { const sx = spitX(z); return sx != null && x < sx - 1 && z > 77.5 && z < 104; };

// Landing: bamboo jetty along +x off the point north of the mouth; long-tails beached on the shore north of it.
const JETTY = { x0: 3, x1: 22, z: 61, y: 2 };
// Rope bridge: slung diagonally across the river (NE bank → SW bank) so the default camera (yaw 20) sees its belly
// side-on rather than end-on; the anchors are tower landings on each bank, ladders face away from the river.
const BRIDGE = { a: [-10, 57], b: [-25, 74] };
const landward = (p, q) => { const dx = p[0] - q[0], dz = p[1] - q[1]; return Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)]; };
const ladderFoot = (p, q) => { const [dx, dz] = landward(p, q); return [p[0] + dx * 3, p[1] + dz * 3]; };

export default function build(g, ctx) {
  ground(g, ctx);
  for (const [k, v] of Object.entries(MATS)) ctx.P.add(k, v);
  const [[X0, , Z0], [X1, , Z1]] = ctx.box;
  const S = { g, ctx, R: ctx.rng, N: ctx.noise, X0, X1, Z0, Z1, spots: {}, avoid: [] };

  shapeDelta(S);
  barDetails(S);
  foam(S);
  clearings(S);
  landing(S);
  bridge(S);
  camp(S);
  forest(S);
  banks(S);
  capCorner(S);
  trimPaths(S);
  waterPlants(S);
  waterDetails(S);
  drowned(S);
  fisherman(S);
  egrets(S);
  life(S);
  // forest feet/limbs at the two jungle seams (west: trail, north: giant) overshoot by a voxel or two: trim explicitly;
  // anything past the lake (east) or front edges would still be reported
  g.paint(() => 0, [X0 - 12, -20, Z0 - 12], [X0 - 1, 150, Z1 + 12]);
  g.paint(() => 0, [X0 - 12, -20, Z0 - 12], [X1 + 12, 150, Z0 - 1]);
}

// ---- terrain: mouth bar, spit, lagoon -------------------------------------------------------------------------
function shapeDelta(S) {
  const { g, N } = S;
  const [ux, uz] = BAR.axis, ul = Math.hypot(ux, uz);
  for (let z = 60; z <= 112; z++) for (let x = -24; x <= 26; x++) {
    const c = columnAt(x, z);
    if (c.kind !== 'lake') continue;
    const bed = c.bed;
    let top = -Infinity, kind = 'sand';
    // a fan of shallows off the mouth (river sediment), lobed with noise
    const dm = Math.hypot(x - MOUTH[0], z - MOUTH[1]);
    if (x > MOUTH[0] - 3) top = Math.max(top, Math.round(-1.1 - dm * 0.2 + N.simplex2(x * 0.16, z * 0.16) * 0.9));
    // mouth bar: an elongated island aligned with the flow; gravelly head, sandy tail
    {
      const dx = x - BAR.c[0], dz = z - BAR.c[1], u = (dx * ux + dz * uz) / ul, v = (-dx * uz + dz * ux) / ul;
      const r = Math.hypot(u / BAR.a, v / BAR.b) + N.simplex2(x * 0.3 + 7, z * 0.3) * 0.12;
      const t = r < 0.42 ? 2 : r < 1 ? 1 : r < 1.22 ? 0 : r < 1.9 ? -1 : -Infinity;
      if (t > top) { top = t; kind = u < -BAR.a * 0.45 ? 'gravel' : 'sand'; }
    }
    // the spit: pebbles on the lake side, sand on the lagoon side, a low dune crest along its middle
    {
      const { d, s } = polyDist(SPIT, x, z);
      const w = 1.7 + N.simplex2(x * 0.2, z * 0.2) * 0.45 - (s > 0.85 ? (s - 0.85) * 5 : 0);
      const t = d < w * 0.5 && s > 0.12 && s < 0.7 ? 2 : d < w ? 1 : d < w + 0.9 ? 0 : d < w + 2.4 ? -1 : -Infinity;
      if (t > top) { top = t; kind = inLagoon(x, z) ? 'sand' : 'gravel'; }
    }
    // the lagoon: a calm sandy-bottomed pool behind the spit
    if (inLagoon(x, z)) {
      const t = N.simplex2(x * 0.12, z * 0.12) > 0.15 ? -1 : -2;
      if (t > top) { top = t; kind = 'lagoon'; }
    }
    top = Math.min(top, 2);
    if (!(top > bed)) continue;
    const topMat = top >= 2 ? (hash3(x, 2, z, 3) < 0.6 ? 'mouth_sandDry' : 'sandJ')
      : top === 1 ? (kind === 'gravel' ? 'mouth_gravel' : hash3(x, 1, z, 3) < 0.25 ? 'mouth_sandDry' : 'sandJ')
      : top === 0 ? 'mouth_wetSand' : kind === 'gravel' && top === -1 ? 'mouth_gravel' : 'sandJ';
    for (let y = bed + 1; y <= top; y++) g.set(x, y, z, g.mat(y === top ? topMat : top - y <= 1 ? 'sandJ' : 'silt'));
    if (top < LAKE_Y) for (let y = top + 1; y <= LAKE_Y; y++) g.set(x, y, z, g.mat('lakeWater'));
  }
}

/** The mouth bar's story: a drowned log in the shallows off it, the periscope otter over its half-eaten fish. */
function barDetails(S) {
  const { g } = S;
  const [ux, uz] = BAR.axis, ul = Math.hypot(ux, uz), at = (u, v) => [Math.round(BAR.c[0] + (u * ux - v * uz) / ul), Math.round(BAR.c[1] + (u * uz + v * ux) / ul)];
  const top = (x, z) => g.top(x, z);
  const put = (x, y, z, m) => g.set(x, y, z, g.mat(m));
  // a drowned log lying in the shallows off the bar's back (−v) side, a voxel or two of water between it and the sand,
  // so the bar's pale shape stays clean
  const lake = g.mat('lakeWater');
  let edge = 0;
  for (let u = 3; u <= 7; u++) for (let v = -2; v >= -8; v--) { const [x, z] = at(u, v); if (g.get(x, LAKE_Y, z) === lake && g.top(x, z) === LAKE_Y) { edge = Math.min(edge, v); break; } }
  for (let u = 3; u <= 7; u++) {
    const [x, z] = at(u, edge - 1.5);
    if (g.get(x, LAKE_Y, z) !== lake) continue;
    put(x, LAKE_Y, z, 'deadWoodWet');
    if (u > 3 && u < 7) put(x, LAKE_Y + 1, z, u === 6 ? 'mouth_snagDark' : 'mouth_snag');
  }
  // the 'periscope' otter: sitting bolt upright on the bar's head over its half-eaten fish, cream chest to the camera
  const [ox, oz] = at(-4, 0), oy = top(ox, oz) + 1;
  for (let x = ox; x <= ox + 1; x++) for (let z = oz; z <= oz + 1; z++) for (let y = oy; y <= oy + 2; y++)
    put(x, y, z, z === oz + 1 && y >= oy + 1 ? 'mouth_otterThroat' : 'mouth_otterFur');                // body, chest
  for (let x = ox; x <= ox + 1; x++) for (let z = oz; z <= oz + 1; z++) put(x, oy + 3, z, 'mouth_otterFur');   // head
  put(ox, oy + 3, oz + 2, 'mouth_otterNose');                                                              // nose
  for (let k = 1; k <= 3; k++) put(ox + (k === 3 ? 1 : 0), oy, oz - k, 'mouth_otterFur');                // tail flat behind
  put(ox, oy, oz + 2, 'mouth_fishSilver'); put(ox + 1, oy, oz + 2, 'mouth_fishSilver'); put(ox + 2, oy, oz + 2, 'petalRed');   // the fish, bitten
  put(ox, oy + 1, oz + 2, 'mouth_otterFur'); put(ox + 1, oy + 1, oz + 2, 'mouth_otterFur');                 // front paws on it
  S.spots.periscope = [ox, oy, oz];
}

/** White water where the river steps down: the rapid (2 → 1) and the lip at the mouth (river 1 → lake 0). */
function foam(S) {
  const { g } = S;
  const foamId = g.mat('mouth_foam');
  for (let z = 44; z <= 80; z++) for (let x = -40; x <= 4; x++) {
    const c = columnAt(x, z);
    if (c.kind === 'land') continue;
    let hi = -Infinity;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = columnAt(x + dx, z + dz);
      if (n.kind !== 'land') hi = Math.max(hi, n.water);
    }
    if (!(hi > c.water)) continue;
    if (g.get(x, c.water, z) !== g.mat(c.kind === 'lake' ? 'lakeWater' : 'riverWater')) continue;
    if (hash3(x, 5, z, 11) < 0.72) g.set(x, c.water, z, foamId);
    // a second, broken row of foam just below the lip
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const n = columnAt(x + dx, z + dz);
      if (n.kind !== 'land' && n.water === c.water && hash3(x + dx, 6, z + dz, 12) < 0.3 && g.get(x + dx, n.water, z + dz) !== foamId) g.set(x + dx, n.water, z + dz, foamId);
    }
  }
}

// ---- clearings and paths (repaint the top voxel of land columns, away from the seams) -------------------------------
function forestCell(S, x, z) {
  const r = riverAt(x, z), ld = landDist(x, z);
  if (r.d < r.w + (x < S.X0 + 8 ? 4 : 8)) return false;                    // open river banks (bamboo, the bridge)
  if (z < S.Z0 + 6) return true;                                            // north seam: the giant's forest continues
  if (x < S.X0 + 7 && (z < 50 || (z > 64 && z < 88))) return true;          // west seam: the trail's forest (z 66–80)
  if (z < 52 && x < -4) return true;                                        // north block, behind the landing
  if (z > 66 && z < 92 && ld > 9 && x < -31) return true;                   // a strip of woods along the west seam
  return false;
}
function clearings(S) {
  const { g, N, X0, X1, Z0, Z1 } = S;
  const floor = new Set(FLOOR.map((m) => g.mat(m)));
  const grass = g.mat('mouth_grass'), dry = g.mat('mouth_grassDry'), path = g.mat('mouth_path');
  // the footpath: landing → along the north bank → the bridge; across → into the south-west woods → down to the lagoon
  const fa = ladderFoot(BRIDGE.a, BRIDGE.b), fb = ladderFoot(BRIDGE.b, BRIDGE.a);
  const PATH = smooth2([[9, 51.5], [3, 52.5], [-4, 53], [fa[0], fa[1] - 1], [-17, 51], [-24, 49.5]], 5);
  const PATH2 = smooth2([[fb[0], fb[1] + 1], [-24, 81], [-21, 86], [-17, 92]], 5);
  S.paths = [PATH, PATH2];
  for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) {
    const c = columnAt(x, z);
    if (c.kind !== 'land') continue;
    const y = c.top, id = g.get(x, y, z);
    const onPath = Math.min(polyDist(PATH, x, z).d, polyDist(PATH2, x, z).d) < 0.9 + N.simplex2(x * 0.4, z * 0.4) * 0.35;
    if (onPath && x > X0 + 2) { g.set(x, y, z, path); continue; }
    if (!floor.has(id) || forestCell(S, x, z) || x < X0 + 4 || z < Z0 + 4 || (x < -22 && z > 96)) continue;   // seams + the front-left undergrowth keep the shared floor
    const n = N.simplex2(x * 0.09 + 31, z * 0.09);
    g.set(x, y, z, n > 0.45 ? dry : n < -0.5 ? g.mat('floorMoss') : grass);
    const h = hash3(x, 7, z, 21);                                           // wild flowers dotted through the meadow
    if (h < 0.03 && N.simplex2(x * 0.2, z * 0.2 + 9) > 0.1) g.set(x, y + 1, z, g.mat('petalYellow'));
  }
}

// ---- the landing: bamboo jetty, long-tails, boat shed, spirit house, people -----------------------------------------
function bedBelow(g, x, y, z) { while (y > -16) { const id = g.get(x, y, z); if (id && g.palette.def(id).kind !== 'water' && g.palette.def(id).kind !== 1) return y; y--; } return -16; }
function isWaterId(g, id) { if (!id) return false; const k = g.palette.def(id)?.kind; return k === 'water' || k === 2 || k === 1; }

function landing(S) {
  const { g } = S;
  const { x0, x1, z: zc, y } = JETTY;
  const put = (x, yy, z, m) => g.set(x, yy, z, g.mat(m));
  const pole = (x, z, k) => { const h = hash3(x, k, z, 7); return h < 0.18 ? 'bambooPoleDark' : h < 0.6 ? 'bambooPole' : 'mouth_bambooPale'; };
  // jetty stem: bamboo poles laid across, darker stringers under the edges, lashings every third pole
  for (let x = x0; x <= x1; x++) {
    for (let z = zc - 1; z <= zc + 1; z++) put(x, y, z, pole(x, zc, 0));
    for (const z of [zc - 1, zc + 1]) put(x, y - 1, z, 'bambooPoleDark');
    if (x % 3 === 0) for (const z of [zc - 2, zc + 2]) put(x, y, z, 'fiberRope');
  }
  // the head: a wider platform with a thatched shade roof, benches, waiting tourists
  const hx0 = x1 - 6, hz0 = zc - 4, hz1 = zc + 1;
  for (let x = hx0; x <= x1; x++) for (let z = hz0; z <= hz1; z++) { put(x, y, z, pole(x, 3, 1)); if (z === hz0 || x === x1) put(x, y - 1, z, 'bambooPoleDark'); }
  // piles down to the bed; on the north side they rise as rail posts with a bamboo handrail
  const piles = [];
  for (let x = x0 + 1; x < hx0; x += 3) piles.push([x, zc - 2, 2], [x, zc + 2, 0]);
  for (let x = hx0; x <= x1 + 1; x += 3) piles.push([x, hz1 + 1, 0], [x, hz0 - 1, 2]);
  piles.push([x1 + 1, zc, 0], [x1 + 1, zc - 2, 0]);
  for (const [x, z, up] of piles) { const b = bedBelow(g, x, y - 1, z); for (let yy = b + 1; yy <= y + up; yy++) put(x, yy, z, 'bambooPoleDark'); }
  for (let x = x0 + 1; x <= x1; x++) if (!g.get(x, y + 2, zc - 2)) put(x, y + 2, zc - 2, 'bambooPole');
  const rx0 = hx0 + 1, rx1 = x1 - 1, rz0 = hz0 + 1, rz1 = hz1;
  for (const [x, z] of [[rx0, rz0], [rx1, rz0], [rx0, rz1], [rx1, rz1]]) for (let yy = y + 1; yy <= y + 6; yy++) put(x, yy, z, 'bambooPoleDark');
  g.roof([rx0, y + 7, rz0], [rx1, y + 7, rz1], (x, yy, z) => (hash3(z, yy, x >> 1, 9) < 0.3 ? 'thatchPalmLight' : hash3(x, yy, z, 4) < 0.85 ? 'thatchPalm' : 'thatchPalmDark'),
    { type: 'gable', axis: 'x', overhang: 1, slope: 1, thickness: 2 });
  for (let x = rx0 + 1; x < rx1; x++) put(x, y + 1, rz0, 'plankDark');                 // bench along the back
  person(g, [rx0 + 1, y + 1, rz0], { side: '+z', pose: 'sit', seed: 41, shirt: 'lifeVest' });
  person(g, [rx0 + 3, y + 1, rz0], { side: '+z', pose: 'sit', seed: 44, shirt: 'lifeVest' });
  for (const yy of [y + 3, y + 4]) put(rx1, yy, rz1 - 1, 'lifeVest');                 // vests hung on a post
  put(rx1 - 1, y + 1, rz1, 'templeWhite'); put(rx1 - 1, y + 2, rz1, 'awningBlue');      // cool box
  put(x1, y + 1, hz0, 'templeRed');                                                    // fuel can
  // a tall mooring pole at the jetty head wrapped in ribbons and marigold garlands (the boatmen's offering to Mae Ya Nang,
  // the boat goddess), a red streamer on top
  const fx = x1 + 1, fz = hz1 + 1;
  const RIB = ['ribbonRed', 'ribbonYellow', 'ribbonPink', 'ribbonGreen', 'templeWhite'];
  for (let yy = y + 1; yy <= y + 12; yy++) put(fx, yy, fz, yy > y + 4 ? RIB[(yy * 3) % 5] : 'bambooPoleDark');
  for (const yy of [y + 6, y + 9]) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(fx + dx, yy, fz + dz, 'marigold');
  for (const [dx, dy] of [[1, 12], [2, 11], [3, 11], [4, 10]]) put(fx + dx, y + dy, fz, 'ribbonRed');
  // loading the boat for the raft houses across the lake: a long-tail moored alongside, bow out, its hull filling with
  // supplies the helper on the jetty hands down to the boatman — rice sacks, an ice block half under hessian, blue
  // drinking-water crates, a red gas bottle still waiting on the deck; the boat dog keeps watch from the bow
  const mx = x0 + 7, mz = zc + 5;                                        // hull: x mx-8 … mx+7, interior z mz-1 … mz
  const moored = longtail(g, [mx, LAKE_Y, mz], { dir: '+x', length: 16, canopy: false, passengers: 0, driver: false, shaft: 3, paint: 'longtailPaint', seed: 64 });
  put(mx + 7, y, zc + 2, 'fiberRope'); put(mx + 7, y - 1, zc + 3, 'fiberRope');                   // bow line to a pile
  const box = (xa, ya, za, xb, yb, zb, m) => { for (let xx = xa; xx <= xb; xx++) for (let yy = ya; yy <= yb; yy++) for (let zz = za; zz <= zb; zz++) put(xx, yy, zz, m); };
  // stacked above the gunwale (y 2) so they read: rice sacks aft, the ice block on a crate half under hessian amidships,
  // a stack of blue water crates forward
  box(mx - 5, 0, mz - 1, mx - 4, 2, mz, 'mouth_rice'); put(mx - 5, 3, mz, 'mouth_rice'); put(mx - 4, 3, mz, 'mouth_rice');
  box(mx + 1, 0, mz - 1, mx + 2, 0, mz, 'mouth_crate'); box(mx + 1, 1, mz - 1, mx + 2, 2, mz, 'mouth_ice');
  box(mx + 1, 3, mz - 1, mx + 1, 3, mz, 'mouth_hessian'); put(mx + 2, 3, mz - 1, 'mouth_hessian'); box(mx + 2, 2, mz + 1, mx + 2, 2, mz + 1, 'mouth_hessian');
  box(mx + 4, 0, mz - 1, mx + 4, 2, mz, 'mouth_crate'); box(mx + 3, 0, mz, mx + 3, 1, mz, 'mouth_crate');
  person(g, [mx - 3, 0, mz], { side: '-z', pose: 'wave', seed: 66, hat: 'thatchPalmLight', shirt: 'templeWhite' });   // boatman reaching up
  person(g, [mx, y + 1, zc + 1], { side: '+z', pose: 'wave', seed: 52, shirt: 'awningBlue' });                        // helper handing down
  box(mx - 2, 6, zc + 2, mx - 1, 6, zc + 3, 'mouth_rice');                                               // the sack between their hands
  box(mx + 4, y + 1, zc - 1, mx + 5, y + 1, zc, 'mouth_rice'); put(mx + 4, y + 2, zc, 'mouth_rice');      // still on the jetty: sacks,
  box(mx + 7, y + 1, zc, mx + 7, y + 2, zc, 'mouth_crate'); put(mx + 8, y + 1, zc, 'mouth_crate');       // crates,
  put(mx + 2, y + 1, zc, 'templeRed'); put(mx + 2, y + 2, zc, 'templeRed'); put(mx + 2, y + 3, zc, 'metalDark'); // a red gas bottle
  S.spots.dog = [mx + 5.5, 5, mz, 90];                                   // standing on the narrow bow, nose to the lake

  // long-tails pulled up bow-first on the beach north of the jetty (side-on to the camera, a staggered row of prows)
  S.prows = [moored.bow];
  [[47, 15, 'ribbonGreen', 'awningBlue'], [53, 14, 'templeRed', false]].forEach(([pz, L, paint, canopy], i) => {
    const bv = -(L >> 1) + L - 1;
    let sx = 30;
    for (let x = -10; x <= 30; x++) if (columnAt(x, pz + 1).kind === 'lake' && columnAt(x, pz).kind === 'lake') { sx = x; break; }
    const r = longtail(g, [sx - 1 + bv, LAKE_Y, pz], { dir: '-x', length: L, canopy, passengers: 0, driver: false, shaft: 3, paint, seed: 60 + i });
    S.prows.push(r.bow);
    // bow line up the beach to a stake
    const st = [sx - 4, g.top(sx - 4, pz) + 1, pz + 1];
    put(st[0], st[1], st[2], 'bambooPoleDark'); put(st[0], st[1] + 1, st[2], 'bambooPoleDark');
    put(st[0] + 1, st[1], st[2], 'fiberRope'); put(st[0] + 2, st[1], st[2], 'fiberRope');
  });
  // a boatman wading at the stern of the middle boat, a kid on the beach
  person(g, [24, LAKE_Y, 52], { side: '-x', seed: 67, hat: 'thatchPalmLight', shirt: 'fabricRed' });
  person(g, [6, g.top(6, 58) + 1, 58], { side: '+x', pose: 'wave', seed: 71 });

  // boat shed behind the beach: bamboo posts, thatch, a woven back wall, an engine being mended, drums, nets
  const sx0 = -7, sx1 = -1, sz0 = 45, sz1 = 50;
  let sy = -Infinity;
  for (let x = sx0; x <= sx1; x++) for (let z = sz0; z <= sz1; z++) sy = Math.max(sy, g.top(x, z));
  for (let x = sx0; x <= sx1; x++) for (let z = sz0; z <= sz1; z++) { for (let yy = g.top(x, z) + 1; yy <= sy; yy++) put(x, yy, z, 'soil'); put(x, sy, z, hash3(x, 0, z, 2) < 0.3 ? 'plankDark' : 'mouth_path'); }
  for (const [x, z] of [[sx0, sz0], [sx1, sz0], [sx0, sz1], [sx1, sz1], [(sx0 + sx1) >> 1, sz0]]) for (let yy = sy + 1; yy <= sy + 5; yy++) put(x, yy, z, 'bambooPoleDark');
  g.roof([sx0, sy + 6, sz0], [sx1, sy + 6, sz1], (x, yy, z) => (hash3(x, yy, z >> 1, 5) < 0.25 ? 'thatchPalmLight' : 'thatchPalm'), { type: 'gable', axis: 'x', overhang: 1, slope: 1, thickness: 2 });
  for (let x = sx0 + 1; x < sx1; x++) for (let yy = sy + 1; yy <= sy + 4; yy++) put(x, yy, sz0, ((x + yy) & 3) < 2 ? 'bambooMat' : 'bambooMatDark');
  const ex = sx0 + 2, ez = sz0 + 3;
  put(ex, sy + 1, ez, 'beam'); put(ex + 2, sy + 1, ez, 'beam'); for (let x = ex; x <= ex + 2; x++) put(x, sy + 2, ez, 'beam');
  put(ex, sy + 3, ez, 'engineMetal'); put(ex + 1, sy + 3, ez, 'engineMetal'); put(ex + 1, sy + 4, ez, 'metalDark'); put(ex + 2, sy + 3, ez, 'templeRed');
  person(g, [ex + 1, sy + 1, ez + 1], { side: '-z', seed: 61, shirt: 'awningBlue' });
  put(sx1 - 1, sy + 1, sz0 + 1, 'raftFloat'); put(sx1 - 1, sy + 2, sz0 + 1, 'raftFloat'); put(sx1 - 1, sy + 1, sz0 + 2, 'templeRed');
  put(sx0 + 1, sy + 1, sz0 + 1, 'mouth_net'); put(sx0 + 2, sy + 1, sz0 + 1, 'mouth_net'); put(sx0 + 1, sy + 2, sz0 + 1, 'fiberRope');
  S.avoid.push([[sx0 - 2, sz0 - 2], [sx1 + 2, sz1 + 2]]);

  // spirit house on the point between the jetty and the beach, facing the lake
  const shx = -1, shz = 56, shy = g.top(shx, shz) + 1;
  spiritHouse(g, [shx, shy, shz], { side: '+x', pillar: 2, seed: 5 });
  S.avoid.push([[shx - 4, shz - 4], [shx + 6, shz + 4]]);
  S.avoid.push([[x0 - 4, zc - 3], [x0 + 2, zc + 3]]);
  S.spots.jettyPosts = [[x0 + 1 + 3 + 0.5, y + 3, zc - 2 + 0.5], [fx + 0.5, y + 13, fz + 0.5]];
}

// ---- rope bridge over the rapid -------------------------------------------------------------------------------------
function bridge(S) {
  const { g } = S;
  const { a: A, b: B } = BRIDGE;
  const top3 = (p) => { let t = -Infinity; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) t = Math.max(t, g.top(p[0] + dx, p[1] + dz)); return t; };
  const deck = Math.max(top3(A), top3(B)) + 8;
  const put = (xx, yy, zz, m) => g.set(xx, yy, zz, g.mat(m));
  // towers: a 3×3 bamboo landing on four tall posts with a crossbar, a ladder down the landward side
  for (const [p, q] of [[A, B], [B, A]]) {
    const [cx, cz] = p, [lx, lz] = landward(p, q);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) put(cx + dx, deck, cz + dz, hash3(dx, dz, cx, 2) < 0.5 ? 'bambooPole' : 'mouth_bambooPale');
    for (const dx of [-2, 2]) for (const dz of [-2, 2]) { for (let yy = g.top(cx + dx, cz + dz) - 1; yy <= deck + 4; yy++) put(cx + dx, yy, cz + dz, 'bambooPoleDark'); }
    for (let k = -2; k <= 2; k++) { put(cx + k, deck + 5, cz - 2, 'bambooPoleDark'); put(cx + k, deck + 5, cz + 2, 'bambooPoleDark'); }
    for (let k = -1; k <= 1; k++) { put(cx + k, deck - 1, cz - 2, 'bambooPole'); put(cx + k, deck - 1, cz + 2, 'bambooPole'); put(cx - 2, deck - 1, cz + k, 'bambooPole'); put(cx + 2, deck - 1, cz + k, 'bambooPole'); }
    const [fx, fz] = [cx + lx * 2, cz + lz * 2], ax = lz !== 0 ? 1 : 0, az = lx !== 0 ? 1 : 0;      // ladder rails across it
    for (let yy = g.top(fx, fz) + 1; yy <= deck + 1; yy++) {
      put(fx - ax, yy, fz - az, 'bambooPoleDark'); put(fx + ax, yy, fz + az, 'bambooPoleDark');
      if (yy % 2 === 0 && yy <= deck) put(fx, yy, fz, 'bambooPole');
    }
    put(fx, deck, fz, 0);
  }
  ropeBridge(g, [A[0], deck, A[1]], [B[0], deck, B[1]], { width: 3, sag: 4, railH: 2, every: 6, gaps: 0.15, rope: 'mouth_bambooPale', posts: false, seed: 4 });
  // the rapid under the span: dark limestone boulders in the channel, foam piling on their upstream faces and a V of
  // white water trailing downstream (the river runs toward +x here)
  for (const [bx, bz, s] of [[-22, 61, 1], [-19, 65, 2], [-21, 68, 3], [-17, 62, 4]]) {
    const c = columnAt(bx, bz);
    if (c.kind !== 'river') continue;
    rock(g, [bx, c.bed + 1, bz], { size: [1.7, 2.4, 1.5], stone: ['limestoneDark', 'limestoneDark', 'limestone'], bury: 0.2, seed: 300 + s });
    const fm = g.mat('mouth_foam');
    const foamAt = (fx, fz) => { const n = columnAt(fx, fz); if (n.kind === 'river' && g.get(fx, n.water, fz) === g.mat('riverWater')) g.set(fx, n.water, fz, fm); };
    for (let dz = -1; dz <= 1; dz++) foamAt(bx - 2, bz + dz);
    foamAt(bx - 3, bz);
    for (let k = 1; k <= 4; k++) { foamAt(bx + 1 + k, bz - Math.round(k * 0.6) - 1); foamAt(bx + 1 + k, bz + Math.round(k * 0.6) + 1); }
  }
  S.bridge = { A, B, deck };
  S.spots.bridgePerch = [A[0] + 1.5, deck + 6, A[1] - 1.5];
  S.avoid.push([[A[0] - 4, A[1] - 6], [A[0] + 4, A[1] + 4]], [[B[0] - 4, B[1] - 4], [B[0] + 4, B[1] + 6]]);
}

// ---- forest: rainforest on the untouched floor (north block + south-west woods) ------------------------------------
function forest(S) {
  const { g, X0, X1, Z0, Z1 } = S;
  rainforest(g, [X0, Z0], [X1, Z1], {
    on: FLOOR, border: false, height: [14, 22], emergents: 0, gaps: 0.2, flowering: 0, overhang: 0, edge: 6,
    avoid: [...S.avoid, [[X0, 90], [-18, Z1]], [[X0, Z0], [-31, 55]], ...S.paths.flatMap((p) => p.filter((_, i) => i % 2 === 0).map(([x, z]) => [[x - 3, z - 3], [x + 3, z + 3]]))], seed: 777,
  });
}

// ---- river banks: bamboo groves, bananas, understory --------------------------------------------------------------
function banks(S) {
  const { g, R } = S;
  const clumps = [[-27, 51, 13], [-34, 66, 15], [-34, 75, 12], [-30, 82, 11]];
  clumps.forEach(([x, z, h], i) => {
    const y = g.top(x, z);
    if (columnAt(x, z).kind !== 'land') return;
    bamboo(g, [x, y + 1, z], { height: h, culms: 9 + (i % 3) * 2, spread: 1.5, fan: 12, seed: 90 + i });
  });
  // bananas and a big shade tree around the landing
  for (const [x, z, s] of [[3, 44, 2], [-24, 85, 5], [-30, 92, 6]]) {
    if (columnAt(x, z).kind !== 'land') continue;
    banana(g, [x, g.top(x, z) + 1, z], { seed: 120 + s });
  }
  // understory on the meadow edges and in the woods
  undergrowth(g, [S.X0 + 3, S.Z0 + 3], [S.X1, S.Z1], { on: FLOOR, density: 0.8, seed: 55, mix: { flower: 0 },
    avoid: (x, z) => { const r = riverAt(x, z); return r.d < r.w + 2 || S.avoid.some(([a, b]) => x >= a[0] && x <= b[0] && z >= a[1] && z <= b[1]) || (S.paths ?? []).some((p) => polyDist(p, x, z).d < 3.2); } });
}

/** Fishermen's camp on the lagoon shore: a thatched lean-to, a fish-drying rack, a smoky breakfast fire, a net drying. */
function camp(S) {
  const { g, ctx } = S;
  const put = (x, y, z, m) => g.set(x, y, z, g.mat(m));
  const gy = (x, z) => columnAt(x, z).top;
  // lean-to: a raised bamboo floor, posts, a shed roof of atap sloping back (−x), a sleeping mat and a sack
  const lx0 = -27, lx1 = -23, lz0 = 89, lz1 = 93;
  let fy = -Infinity;
  for (let x = lx0; x <= lx1; x++) for (let z = lz0; z <= lz1; z++) fy = Math.max(fy, gy(x, z) + 1);
  for (let x = lx0; x <= lx1; x++) for (let z = lz0; z <= lz1; z++) {
    for (let y = gy(x, z) + 1; y < fy; y++) if ((x === lx0 || x === lx1) && (z === lz0 || z === lz1)) put(x, y, z, 'bambooPoleDark');
    put(x, fy, z, (z & 1) ? 'bambooPole' : 'mouth_bambooPale');
  }
  for (const [x, z] of [[lx0, lz0], [lx0, lz1], [lx1, lz0], [lx1, lz1]]) for (let y = fy + 1; y <= fy + 4; y++) put(x, y, z, 'bambooPoleDark');
  g.roof([lx0, fy + 5, lz0], [lx1, fy + 5, lz1], (x, y, z) => (hash3(x, y, z, 3) < 0.3 ? 'thatchPalmLight' : hash3(z, x, 1, 4) < 0.85 ? 'thatchPalm' : 'thatchPalmDark'),
    { type: 'gable', axis: 'z', overhang: 1, slope: 1, thickness: 2 });
  for (let z = lz0; z <= lz1; z++) for (let y = fy + 1; y <= fy + 3; y++) put(lx0, y, z, ((z + y) & 3) < 2 ? 'bambooMat' : 'bambooMatDark');   // woven back wall
  put(lx0 + 1, fy + 1, lz0 + 1, 'hammock'); put(lx0 + 1, fy + 1, lz0 + 2, 'hammock'); put(lx0 + 2, fy + 1, lz0 + 1, 'hammock');           // sleeping mat
  put(lx0 + 1, fy + 1, lz1 - 1, 'bambooMatDark'); put(lx0 + 1, fy + 2, lz1 - 1, 'thatchPalmLight');                                    // rice sack
  // breakfast fire: a ring of stones and crossed logs with the flames showing, a sooty pot hung from a bamboo tripod
  // above them, three pla pao (salt-grilled fish) on skewers leaning over the embers, a woman tending it
  const [fx, fz] = [-20, 92], fgy = gy(fx, fz);
  campfire(g, [fx, fgy + 1, fz], { radius: 1.6, stone: 'stoneDark', log: 'log' });
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2]]) g.line([fx + dx, fgy + 1, fz + dz], [fx, fgy + 6, fz], g.mat('bambooPoleDark'));
  put(fx, fgy + 5, fz, 'metalDark'); put(fx, fgy + 4, fz, 'metalDark');
  for (const [dx, dz] of [[3, 0], [2, 2], [3, -2]]) {
    const sx = Math.sign(dx), sz = Math.sign(dz);
    g.line([fx + dx, fgy + 1, fz + dz], [fx + dx - sx * 2, fgy + 3, fz + dz - sz], g.mat('bambooPoleDark'));
    put(fx + dx - sx * 2, fgy + 4, fz + dz - sz, 'mouth_fishSilver');
  }
  person(g, [fx - 3, fgy + 1, fz + 1], { side: '+x', pose: 'sit', seed: 83, shirt: 'fabricRed' });
  ctx.emit('particles', { preset: 'smoke', count: 26, size: 1.6, opacity: 0.35, box: [[fx - 1, fgy + 6, fz - 1], [fx + 2, fgy + 20, fz + 2]] });
  // drying rack: two forked posts, a pole across, a row of silver fish hanging head-down
  const rz = 97, rx0 = -32, rx1 = -27;
  for (const x of [rx0, rx1]) { for (let y = gy(x, rz) + 1; y <= gy(x, rz) + 4; y++) put(x, y, rz, 'bambooPoleDark'); put(x - 1, gy(x, rz) + 5, rz, 'bambooPoleDark'); put(x + 1, gy(x, rz) + 5, rz, 'bambooPoleDark'); }
  const ry = Math.max(gy(rx0, rz), gy(rx1, rz)) + 4;
  for (let x = rx0; x <= rx1; x++) put(x, ry, rz, 'bambooPole');
  for (let x = rx0 + 1; x < rx1; x++) { put(x, ry - 1, rz, 'mouth_fishSilver'); if (x & 1) put(x, ry - 2, rz, 'mouth_fishSilver'); }
  // a basket of the morning's catch
  put(-22, gy(-22, 95) + 1, 95, 'bambooMatDark'); put(-22, gy(-22, 95) + 2, 95, 'mouth_fishSilver');
  S.avoid.push([[rx0 - 2, lz0 - 2], [fx + 4, rz + 2]]);
  S.campFire = [fx, fgy, fz];
}

/** Trail crew: cut back any leaves hanging over the footpaths (walkers take the top surface as their ground). */
function trimPaths(S) {
  const { g } = S;
  for (const path of S.paths) for (const [px, pz] of path) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const x = Math.round(px) + dx, z = Math.round(pz) + dz, c = columnAt(x, z);
    if (c.kind !== 'land') continue;
    for (let y = c.top + 1; y <= c.top + 9; y++) { const id = g.get(x, y, z); if (id && g.palette.defs[id]?.sway > 0) g.set(x, y, z, 0); }
  }
}

/** The north-west corner stays understory (≤ 8 tall) so the trail's footbridge at x ≈ −49 stays in view. */
function capCorner(S) {
  const { g, X0, Z0 } = S;
  for (let x = X0; x <= -31; x++) for (let z = Z0; z <= 55; z++) {
    const c = columnAt(x, z);
    if (c.kind !== 'land') continue;
    for (let y = c.top + 9; y <= c.top + 40; y++) if (g.get(x, y, z)) g.set(x, y, z, 0);
  }
}

// ---- reeds, lily pads, lotus ---------------------------------------------------------------------------------------
/** A dense reed tuft standing in shallow water at (x, z): a tall core, shorter stalks around it, blades arching out,
 *  sometimes a cattail or a feathery plume on top. wy = the water surface. */
function reedClump(g, x, z, wy, R) {
  const H = R.int(3, 5), tip = R(), shade = R.pick([['mouth_reed', 'mouth_reedDark'], ['mouth_reed', 'mouth_reedDry'], ['mouth_reedDark', 'mouth_reed']]);
  const cells = [[0, 0, 1], [1, 0, 0.75], [-1, 0, 0.75], [0, 1, 0.75], [0, -1, 0.75], [1, 1, 0.4], [-1, -1, 0.4], [1, -1, 0.4], [-1, 1, 0.4]];
  for (const [dx, dz, k] of cells) {
    if (R() > k) continue;
    const xx = x + dx, zz = z + dz;
    if (g.top(xx, zz) !== wy || !isWaterId(g, g.get(xx, wy, zz))) continue;
    const core = !dx && !dz, h = core ? H : Math.max(1, H - R.int(1, 3)), m = shade[(dx + dz) & 1];
    for (let y = wy + 1; y <= wy + h; y++) g.put(xx, y, zz, m, 'keep');
    if (core && tip < 0.3) g.put(xx, wy + h + 1, zz, 'mouth_cattail', 'keep');
    else if (h >= 2 && R.chance(0.4)) g.put(xx + dx, wy + h, zz + dz, m, 'keep');      // a blade arching out
  }
}
function waterPlants(S) {
  const { g, N } = S;
  const R = rng(321);
  // reed beds: shallow water hugging the shore, the spit's inner edge and the lagoon corners
  for (let z = 58; z <= 116; z++) for (let x = -30; x <= 20; x++) {
    const c = columnAt(x, z);
    if (c.kind === 'land') continue;
    const wy = c.water, top = g.top(x, z);
    if (top !== wy || !isWaterId(g, g.get(x, wy, z))) continue;
    const depth = wy - bedBelow(g, x, wy, z);
    if (depth > 2) continue;
    let nearDry = false;
    for (let dz = -2; dz <= 2 && !nearDry; dz++) for (let dx = -2; dx <= 2; dx++) { const t = g.top(x + dx, z + dz); if (t > wy && !isWaterId(g, g.get(x + dx, t, z + dz))) { nearDry = true; break; } }
    if (!nearDry) continue;
    if (x > 8 && z < 66) continue;                                         // keep the boats' water open
    if (Math.hypot(x - MOUTH[0], z - MOUTH[1]) < 13 || Math.hypot(x - BAR.c[0], z - BAR.c[1]) < 11) continue;   // the mouth + bar stay open
    const n = N.simplex2(x * 0.13 + 5, z * 0.13);
    if (n < 0.25 || hash3(x, 9, z, 4) > 0.16) continue;
    reedClump(g, x, z, wy, R);
  }
  // lily pads + lotus in the lagoon
  // two lotus clumps of a few pads each, open water between them and the boats
  for (const [cx, cz, sd] of [[-10, 88, 3], [-9, 97, 8]]) lilyPads(g, [cx - 3, cz - 3], [cx + 3, cz + 3], { y: LAKE_Y, clusters: 1, flowers: 1, seed: sd });
}

/** Small things on the water: terrapins sunning on a half-sunk branch in the lagoon, a fish leaping off the bar. */
function waterDetails(S) {
  const { g } = S;
  const put = (x, y, z, m) => g.set(x, y, z, g.mat(m));
  // a bleached branch lying half-sunk in the lagoon, two terrapins on it
  const L = [[-9, 94], [-8, 94], [-7, 94], [-6, 95], [-5, 95]];
  L.forEach(([x, z], i) => { put(x, LAKE_Y, z, 'deadWoodWet'); if (i > 0 && i < 4) put(x, LAKE_Y + 1, z, 'mouth_snag'); });
  put(-4, LAKE_Y + 1, 96, 'mouth_snagDark'); put(-4, LAKE_Y + 2, 96, 'mouth_snag');
  for (const [x, z, dx] of [[-8, 94, -1], [-6, 95, 1]]) {
    put(x, LAKE_Y + 2, z, 'mouth_shell'); put(x + dx, LAKE_Y + 2, z, 'mouth_shell');
    put(x + 2 * dx, LAKE_Y + 2, z, 'mouth_turtleSkin');                      // head poking out
    put(x, LAKE_Y + 3, z, 'mouth_shellHi');
  }
  // a fish leaping from the shallows by the bar: an arc of droplets, the fish at the top, a ring of foam below
  const [fx, fz] = [19, 70];
  put(fx, LAKE_Y + 3, fz, 'mouth_fishSilver'); put(fx + 1, LAKE_Y + 4, fz, 'mouth_fishSilver'); put(fx - 1, LAKE_Y + 3, fz, 'mouth_fishSilver');
  put(fx - 2, LAKE_Y + 2, fz, 'mouth_foam'); put(fx - 3, LAKE_Y + 1, fz, 'mouth_foam');
  for (const [dx, dz] of [[-3, 0], [-4, 1], [-4, -1], [-5, 0]]) put(fx + dx, LAKE_Y, fz + dz, 'mouth_foam');
}

// ---- drowned forest: bleached trunks standing in the lake -----------------------------------------------------------
function drowned(S) {
  const { g } = S;
  S.perches = [];
  const wood = new Set(['mouth_snag', 'mouth_snagDark'].map((m) => g.mat(m)));
  for (const [x, z, h, s] of [[34, 46, 12, 7], [36, 80, 15, 1], [4, 109, 6, 3]]) {
    const c = columnAt(x, z);
    if (c.kind !== 'lake') continue;
    const r = deadTree(g, [x, LAKE_Y, z], { bed: c.bed, height: h, seed: 200 + s, wood: ['mouth_snagDark', 'mouth_snag'] });
    for (let y = r.top[1] - 1; y <= r.top[1]; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)   // weathered dark top
      if (wood.has(g.get(r.top[0] + dx, y, r.top[2] + dz))) g.set(r.top[0] + dx, y, r.top[2] + dz, g.mat('mouth_snagDark'));
    S.perches.push(r.perch, ...r.branches.filter((q) => q !== r.perch).slice(0, 1));
    S.snagTops = [...(S.snagTops ?? []), r.top];
  }
}

// ---- the cast-net fisherman ------------------------------------------------------------------------------------------
function fisherman(S) {
  const { g } = S;
  const p = [17, LAKE_Y, 100];
  longtail(g, p, { dir: '+x', length: 16, passengers: 0, driver: 'sit', shaft: 3, paint: 'plankLight', seed: 77 });
  const [bx, , bz] = p;
  g.set(bx + 4, 1, bz - 1, g.mat('plankDark')); g.set(bx + 4, 1, bz, g.mat('plankDark'));   // a second board to stand on
  person(g, [bx + 3, 2, bz], { side: '+z', pose: 'wave', seed: 79, hat: 'thatchPalmLight', shirt: 'awningBlue' });
  // the net, thrown off the camera-side beam over open water: a flat open lattice mid-throw (the half toward the
  // fisherman 1 higher) — a continuous rim and eight spokes in net colour, read by the gaps between them, a one-voxel
  // crown, grey lead weights hanging under every fourth rim cell, 3 voxels of air above a broken ring of foam on the
  // water where it is about to land, the hand line back to his raised hand
  const cx = bx + 9, cz = bz + 8.5, cy = 5, Rn = 5.2;
  const yAt = (z) => cy + (z + 0.5 < cz ? 1 : 0);
  const rim = [];
  for (let x = Math.floor(cx - Rn - 1); x <= Math.ceil(cx + Rn + 1); x++) for (let z = Math.floor(cz - Rn - 1); z <= Math.ceil(cz + Rn + 1); z++) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz, r = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
    if (r > Rn + 0.5) continue;
    if (r > Rn - 0.5) { rim.push([ang, x, z]); continue; }
    const a = (ang / (Math.PI / 4) + 8) % 1, spoke = Math.min(a, 1 - a) * r < 0.5;
    if (spoke || r < 0.75) g.set(x, yAt(z) + (r < 0.75 ? 1 : 0), z, g.mat('mouth_net'));
  }
  let near = null;
  rim.sort((A, B) => A[0] - B[0]).forEach(([, x, z], i) => {
    g.set(x, yAt(z), z, g.mat('mouth_net'));
    if (i % 4 === 0) g.set(x, yAt(z) - 1, z, g.mat('mouth_weight'));
    if (hash3(x, 0, z, 17) < 0.55) g.set(x, LAKE_Y, z, g.mat('mouth_foam'));
    const d = Math.hypot(x - (bx + 5), z - bz);
    if (!near || d < near[0]) near = [d, x, z];
  });
  g.line([bx + 5, 8, bz], [near[1], yAt(near[2]), near[2]], g.mat('mouth_net'));
  S.fisher = [cx, cy, cz];
}

// ---- static birds: white egrets wading the shallows ---------------------------------------------------------------
/** Great egret standing at p = [x, feetY, z] facing dir ('+x' | '-x' | '+z' | '-z'), about 6 tall: black legs, a
 *  3-long body with a raised back, an S-neck, white head, yellow bill. pose 'stand' | 'hunt' (neck down, the bill tip
 *  touching the water at feetY when it wades). */
function egret(g, p, dir = '+x', pose = 'stand') {
  const [fx, fz] = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[dir];
  const set = (u, y, m) => g.set(p[0] + fx * u, p[1] + y, p[2] + fz * u, g.mat(m));
  set(0, 0, 'mouth_egretLeg'); set(0, 1, 'mouth_egretLeg');
  for (let u = -1; u <= 1; u++) set(u, 2, 'mouth_egret');
  set(-1, 3, 'mouth_egret');
  if (pose === 'hunt') { set(1, 3, 'mouth_egret'); set(2, 2, 'mouth_egret'); set(3, 1, 'mouth_egret'); set(4, 0, 'mouth_egretBill'); }
  else { set(1, 3, 'mouth_egret'); set(2, 4, 'mouth_egret'); set(2, 5, 'mouth_egret'); set(3, 5, 'mouth_egretBill'); }
}
function egrets(S) {
  const { g } = S;
  for (const [x, z, dir, pose] of [[-8, 82, '+x', 'hunt'], [-15, 93, '+x', 'stand'], [-4, 99, '-x', 'hunt']]) {
    const feet = isWaterId(g, g.get(x, LAKE_Y, z)) ? LAKE_Y : g.top(x, z) + 1;
    egret(g, [x, feet, z], dir, pose);
  }
}

// ---- life: actors + points of interest ----------------------------------------------------------------------------
function life(S) {
  const { g, ctx } = S;
  const emit = (d) => ctx.emit('actors', d);
  const barTop = (x, z) => g.top(x, z) + 1;
  // otters: three on the mouth bar, a mother and two cubs swimming round it
  const [bcx, bcz] = BAR.c;
  const OTTER = '#4a2e1c';                                // dark chocolate: reads against the pale sand
  emit({ creature: 'otter', on: 'ground', scale: 0.32, options: { fur: OTTER }, count: 2, behavior: 'wander', area: [[bcx - 3, bcz - 1], [bcx + 4, bcz + 2]], idle: [2, 6], seed: 3 });
  const [ax, az] = BAR.axis, al = Math.hypot(ax, az), loop = [];
  for (let k = 0; k < 10; k++) { const t = (k / 10) * Math.PI * 2, u = Math.cos(t) * BAR.a * 1.45, v = Math.sin(t) * (BAR.b + 4.5); loop.push([bcx + (u * ax - v * az) / al, bcz + (u * az + v * ax) / al]); }
  emit({ id: 'mouth_otters', creature: 'otter', options: { fur: OTTER }, behavior: 'path', path: loop.filter(([x, z]) => columnAt(Math.round(x), Math.round(z)).kind === 'lake') });
  emit({ creature: 'otter', count: 2, options: [{ baby: true, fur: OTTER }], behavior: 'follow', target: 'mouth_otters' });
  // water monitors: one basking on the spit's sandy crest, one lying half-submerged in the lagoon
  const [sx, sz] = SPIT[Math.round(SPIT.length * 0.62)].map(Math.round);   // well down the spit, away from the bar
  emit({ ...LIFE.monitor, spots: [[sx + 0.5, g.top(sx, sz) + 1, sz + 0.5, 160], [-9.5, 0.35, 88.5, 60]] });
  // kingfishers hopping between snags, jetty posts, the mooring pole, the bridge tower and prows
  const perches = [...S.perches.map((p) => [p[0] + 0.5, p[1] + 1, p[2] + 0.5]), ...S.spots.jettyPosts, S.spots.bridgePerch, ...S.prows.slice(0, 2).map((p) => [p[0] + 0.5, p[1] + 1, p[2] + 0.5])];
  const seen = new Set();
  emit({ ...LIFE.kingfisher, count: 3, spots: perches.filter((q) => { const k = q.map(Math.floor).join(); return !seen.has(k) && seen.add(k); }) });
  // egrets flying between the snag tops, the bar's tail and the spit
  const sand = (x, z) => [x + 0.5, g.top(x, z) + 1, z + 0.5];
  emit({ ...LIFE.egret, spots: [...(S.snagTops ?? []).map((t) => [t[0] + 0.5, t[1] + 1, t[2] + 0.5]), sand(sx + 1, sz - 4), sand(-12, 103)] });   // none on the bar
  // dragonflies over the lagoon shore, fish in the shallows, butterflies on the meadows
  emit({ ...LIFE.dragonfly, count: 6, area: [[-16, 80], [2, 102]] });
  emit({ ...LIFE.fish, count: 8, area: [[-2, 58], [24, 90]] });
  emit({ ...LIFE.butterfly, count: 6, area: [[-6, 46], [6, 58]] });
  // people: strolling from the landing along the bank; two crossing the bridge
  const walk = S.paths[0].filter((_, i) => i % 3 === 0);
  for (const [x, z] of S.paths[0]) {               // walkers take the top surface as ground: nothing may hang low over the path
    const xi = Math.round(x), zi = Math.round(z), gy = columnAt(xi, zi).top;
    for (let y = gy + 1; y <= gy + 9; y++) if (g.get(xi, y, zi)) { console.warn(`mouth: path blocked at ${xi},${y},${zi} by ${g.palette.def(g.get(xi, y, zi)).name}`); break; }
  }
  const there = (pts) => [...pts, ...pts.slice(1, -1).reverse()];   // closed loops retrace the way back (no shortcut across)
  emit({ ...LIFE.walker, count: 3, behavior: 'path', path: there(walk) });
  const b = S.bridge, bpath = [];
  for (let k = 0; k <= 10; k++) { const t = k / 10; bpath.push([b.A[0] + 0.5 + (b.B[0] - b.A[0]) * t, Math.round(b.deck - 4 * 4 * t * (1 - t)) + 1, b.A[1] + 0.5 + (b.B[1] - b.A[1]) * t]); }
  emit({ ...LIFE.walker, count: 2, behavior: 'path', path: there(bpath) });
  // the boat dog standing on the bow of the long-tail being loaded
  emit({ creature: 'dog', behavior: 'still', options: { coat: 'golden', size: 'small' }, spots: [S.spots.dog] });

  const poi = (label, icon, target, zoom, yaw, pitch) => ctx.emit('poi', { label, icon, target, zoom, ...(yaw != null ? { yaw } : {}), ...(pitch != null ? { pitch } : {}) });
  poi('Loading the boat at the landing', '🛶', [12, 4, 62], 8);
  poi('Otters on the mouth bar', '🦦', [bcx, 2, bcz], 9);
  poi("Lotus lagoon & fishermen's camp", '🪷', [-10, 3, 82], 8.5, 20, 38);    // pitch 38 keeps the slab edge out of frame
}
