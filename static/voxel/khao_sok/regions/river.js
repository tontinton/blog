// river (MW) — the jungle river and the elephants. The river comes down from the falls (north), widens into a
// deep bathing pool where a herd of Asian elephants bathes, crosses and climbs out, then runs on south between
// pebble beaches. Story beats: a mother showering her calf, a herd crossing from a muddy trail on the high west
// bank to the east bank, a giant fallen tree bridging the river (with a water monitor sunning on it), a strangler
// fig with hornbills behind the pool, kingfishers darting between boulders, butterflies puddling on the gravel, a tapir
// at the water, otters, rattan and Kerriodoxa fan palms on the east bank, a photographer hiding in a leaf blind.
// Terrain helpers live in river-terrain.js.
import { ground } from '../base.js';
import { LIFE, CAMERA, riverAt, riverY } from '../layout.js';
import PAL from '../palette.js';
import {
  hash3, clamp, smoothstep, rainforest, strangler, jungleTree, bamboo, banana, fern, heliconia,
  lianas, epiphytes, undergrowth, fallenLog, rock, lilyPads, person, rattan,
} from '../../lib/index.js';
import { columns, nearest, polyLen, pointAt, riverSide, gradeTrail } from './river-terrain.js';

// ---- the plan ----------------------------------------------------------------------------------------------
const POOL_W = 5;                                     // water top of the bathing pool (one step lower: inlet riffle)
const POOL = { x: -79, z: -3, rx: 13.5, rz: 11.5 };    // the bathing pool, widened out of the layout's reach
const DEEP = { x: -81, z: -0.5, rx: 8.5, rz: 7.5 };   // deepest part of the pool (outer bend, west)
// the herd's route: down a sunken trail on the high west bank, across the shallow riffle just above the pool (well
// clear of the bathers, so water shows round every body), up the east bank and away under the NE forest
const TRAIL_A = [[-117, -34], [-110, -32], [-102, -27], [-95, -21.5], [-88, -19], [-82, -18.5]];
const WADE = [[-82, -18.5], [-77, -18.5], [-72, -18], [-67.5, -17.5]];
const TRAIL_C = [[-67.5, -17.5], [-62, -15.5], [-56, -15], [-50.5, -17.5], [-47, -22.5], [-46.5, -28]];   // ends under the NE forest
const ROUTE = [...TRAIL_A, ...WADE.slice(1), ...TRAIL_C.slice(1)];
// gravel point bars (inside of the bends): centre, radii, rotation (rad)
const BARS = [
  { c: [-63.5, -1], r: [7, 12], rot: 0.1, beach: true },   // east beach of the pool (the herd climbs out here)
  { c: [-62.5, 24], r: [6.5, 11], rot: -0.45, beach: true }, // lower reach, east
  { c: [-77.5, -22], r: [2.6, 5], rot: 0.35 },               // upstream, west
  { c: [-74.5, 13.5], r: [2, 3.4], rot: 0.5 },               // pool outlet islet
];
const FIG = [-102, -11];                              // strangler fig on the west bank, behind the pool
// the only two flowering crowns, bracketing the pool and its beach (lower west bank, east bank): [x, z, height, clear radius, flowers]
const ACCENTS = [[-86, 25, 17, 5, 'yellowFlower'], [-47, 9, 15, 4, ['river_inthanin', 'river_inthaninLight']]];
const POI_YAW = 28;                                    // the elephants' tour stop looks up the lower reach: the sight line runs down the open river
const FIG_YAW = 0;                                     // the hornbill stop looks north: the falls' west tower is the backdrop
const TAPIR = [-71, 24];                               // a Malayan tapir at the waterline of the lower gravel bar (search starts here)
const LEAVES_W = ['canopyBlue', 'jungleLeafDark', 'jungleLeaf', 'jungleLeafLight'];   // no sunlit caps: calm, dark backdrop
const TRUNK_W = ['barkDark', 'bark', 'barkDark'];
const LOG = { a: [-60, -30], b: [-85, -26] };         // fallen giant: root plate on the east bank, crown end on the west
const HIDE = [-55, 9];                                  // the photographer's hide, looking west over the beach

export default function build(g, ctx) {
  ground(g, ctx);
  ctx.clip = true;
  const P = ctx.P, R = ctx.rng, N = ctx.noise;
  materials(P);
  const C = columns(g, ctx.box);
  const { x0, z0, x1, z1 } = C;
  const edgeDist = (x, z) => Math.min(x - x0, x1 - x, z - z0, z1 - z);

  // ---- 1. the bathing pool: widened (cut bank on the west, the outer bend), one step lower, deep in the middle -
  const poolV = (x, z) => 1 - Math.hypot((x - POOL.x) / POOL.rx, (z - POOL.z) / POOL.rz) + N.simplex2(x * 0.11, z * 0.11) * 0.08;
  for (let z = Math.floor(POOL.z - POOL.rz - 3); z <= POOL.z + POOL.rz + 3; z++) for (let x = Math.floor(POOL.x - POOL.rx - 3); x <= POOL.x + POOL.rx + 3; x++) {
    const v = poolV(x, z), i = C.I(x, z);
    if (v > 0 || (C.kind[i] && v > -0.3)) {
      const t = Math.hypot((x - DEEP.x) / DEEP.rx, (z - DEEP.z) / DEEP.rz) + N.simplex2(x * 0.2, z * 0.2) * 0.08;
      const depth = Math.min(0.9 + 2.9 * (1 - smoothstep(0.1, 1.05, t)), 1 + Math.max(0, v) * 9);
      const bed = Math.min(C.kind[i] ? C.top[i] : 99, POOL_W - Math.max(1, Math.round(depth)));
      const mat = depth > 2.6 ? (hash3(x, 0, z, 3) < 0.5 ? 'river_silt' : 'river_siltDark') : depth > 1.6 ? 'river_silt' : 'riverBed';
      C.set(x, z, bed, mat, POOL_W);
    } else if (v > -0.16 && C.top[i] <= POOL_W + 3) C.paint(x, z, hash3(x, 1, z, 4) < 0.4 ? 'river_mudWet' : 'river_mud');   // muddy rim
  }
  // roots hanging out of the cut bank (west rim)
  for (let z = Math.floor(POOL.z - POOL.rz); z <= POOL.z + POOL.rz; z++) for (let x = Math.floor(POOL.x - POOL.rx - 2); x <= POOL.x; x++) {
    if (C.isRiver(x, z) || !C.isRiver(x + 1, z)) continue;
    const t = C.topAt(x, z);
    if (t < POOL_W + 3) continue;
    for (let y = t - 1; y > POOL_W; y--) if (hash3(x, y, z, 12) < 0.18) {
      const len = 1 + Math.floor(hash3(x, y, z, 13) * 3);
      for (let k = 0; k < len && y - k > POOL_W; k++) if (!g.get(x + 1, y - k, z) || g.get(x + 1, y - k, z) === P.id('riverWater')) g.set(x + 1, y - k, z, 'river_root');
    }
  }

  // ---- 2. gravel bars and pebble beaches -------------------------------------------------------------------
  const barV = (b, x, z) => {
    const dx = x - b.c[0], dz = z - b.c[1], c = Math.cos(b.rot), s = Math.sin(b.rot);
    const u = (dx * c - dz * s) / b.r[0], v = (dx * s + dz * c) / b.r[1];
    return 1 - Math.hypot(u, v) + N.simplex2(x * 0.15 + 7, z * 0.15) * 0.12;
  };
  const localWater = (x, z) => { const r = riverAt(x, z); return Math.min(riverY(r.s), poolV(x, z) > -0.4 ? POOL_W : 99); };
  for (const b of BARS) {
    const ext = Math.max(...b.r) + 2;
    for (let z = Math.floor(b.c[1] - ext); z <= b.c[1] + ext; z++) for (let x = Math.floor(b.c[0] - ext); x <= b.c[0] + ext; x++) {
      if (!C.inside(x, z) || edgeDist(x, z) < 4) continue;
      const v = barV(b, x, z);
      if (v <= 0) continue;
      const i = C.I(x, z), w = C.kind[i] ? C.wat[i] : localWater(x, z);
      if (C.kind[i]) {
        // keep the pool itself open: only its rim turns to gravel
        if (poolV(x, z) > 0.22) continue;
        if (v > 0.3) C.set(x, z, w + 1, hash3(x, 1, z, 9) < 0.12 ? 'river_sand' : 'river_gravel');
        else if (v > 0.12) C.set(x, z, w, 'river_gravelWet');
      } else if (b.beach) {
        const k = smoothstep(0, 0.75, v), t0 = C.top[i];
        const nt = Math.max(w + 1, Math.round(t0 * (1 - k) + (w + 1) * k));
        if (nt <= w + 2) C.set(x, z, nt, hash3(x, 2, z, 9) < 0.1 ? 'river_sand' : nt === w + 1 && hash3(x, 3, z, 9) < 0.3 ? 'river_gravelWet' : 'river_gravel');
        else if (nt !== t0) C.set(x, z, nt, 'bank');
      }
    }
  }

  // ---- 3. the elephant trails (sunken, muddy, footprints) --------------------------------------------------
  const LA = polyLen(TRAIL_A), LC = polyLen(TRAIL_C);
  const shoreY = ([px, pz]) => { let w = POOL_W; for (let r = 0; r < 6; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (C.isRiver(Math.round(px) + dx, Math.round(pz) + dz)) return C.wat[C.I(Math.round(px) + dx, Math.round(pz) + dz)] + 1; return w + 1; };
  const hA0 = 15, hA1 = shoreY(TRAIL_A[TRAIL_A.length - 1]);   // trail A: flat at 15 in the forest, then down to the shore
  const profA = (s) => { const u = clamp((s - 9) / (LA - 9)); return hA0 + (hA1 - hA0) * (0.55 * u + 0.45 * smoothstep(0, 1, u)); };
  const hC1 = 10;                                    // trail C: across the beach, then up the east bank
  const hC0 = shoreY(TRAIL_C[0]);
  const profC = (s) => { const u = clamp((s - 2) / 15); return hC0 + (hC1 - hC0) * (0.5 * u + 0.5 * smoothstep(0, 1, u)); };
  const GRAVEL = new Set(['river_gravel', 'river_gravelWet', 'river_sand'].map((m) => P.id(m)));
  const mud = (x, z, d) => (GRAVEL.has(g.get(x, C.topAt(x, z), z)) ? null : d > 3.2 ? 'bank' : hash3(x, 4, z, 5) < 0.25 ? 'river_mudWet' : 'river_mud');
  gradeTrail(C, TRAIL_A, profA, { hw: 4.5, blend: 3, mat: mud });
  gradeTrail(C, TRAIL_C, profC, { hw: 3.8, blend: 3, mat: mud });
  // footprints: pairs of dark sunk prints along the centre lines (water pooling in the lower ones)
  for (const [pts, off] of [[TRAIL_A, 0], [TRAIL_C, 0]]) {
    const L = polyLen(pts);
    for (let s = 2, k = 0; s < L - 1; s += 2.6, k++) {
      const [px, pz] = pointAt(pts, s), [qx, qz] = pointAt(pts, s + 0.5);
      const dx = qx - px, dz = qz - pz, l = Math.hypot(dx, dz) || 1;
      const side = (k & 1 ? 1.6 : -1.6) + (hash3(k, 7, off, 3) - 0.5);
      const fx = Math.round(px - (dz / l) * side), fz = Math.round(pz + (dx / l) * side);
      if (!C.inside(fx, fz) || C.isRiver(fx, fz)) continue;
      const t = C.topAt(fx, fz);
      g.set(fx, t, fz, t <= POOL_W + 1 ? 'river_puddle' : 'river_print');
    }
  }

  // ---- 4. river boulders (limestone, mossy tops) + driftwood ------------------------------------------------
  const STONE = ['limestoneNotch', 'limestoneDark', 'limestone'];
  const BOULDERS = [ // [x, z, rx, ry, rz]
    [-70, -37, 2.4, 2.2, 2], [-66.5, -35, 1.6, 1.5, 1.5], [-73.5, -33, 1.8, 1.6, 2], [-69, -31.5, 2.0, 1.7, 1.8],
    [-75.5, -25.5, 2.2, 1.8, 2],   // one solid mossy lump (tiny ones broke into floating cubes), ≥ 4 clear of the herd's ford
    [-72.5, 17, 1.6, 1.5, 1.8], [-74.5, 25, 1.2, 1.2, 1.4], [-70, 33, 2.2, 2, 1.8], [-62, -19, 2.4, 2.2, 2.2], [-93, 10, 1.8, 1.6, 2],
  ];
  const perches = [];
  for (const [bx, bz, rx, ry, rz] of BOULDERS) {
    const by = C.topAt(Math.round(bx), Math.round(bz)) + 1;
    rock(g, [bx, by, bz], { size: [rx, ry, rz], stone: STONE, moss: 'karstMoss', bury: 0.3, seed: R.int(0, 1e6) });
    const ty = topSolid(g, Math.round(bx), Math.round(bz), by + 8);
    if (ty > (C.wat[C.I(Math.round(bx), Math.round(bz))] ?? 0)) perches.push([Math.round(bx) + 0.5, ty + 1, Math.round(bz) + 0.5]);
  }
  // bleached driftwood stranded on the beaches
  const drift = [[[-69, -1.5], [-62, 2]], [[-61, 12], [-57, 18]]];
  for (const [[ax, az], [bx, bz]] of drift) {
    const ya = C.topAt(ax, az) + 1, yb = C.topAt(bx, bz) + 1;
    fallenLog(g, [ax, ya, az], [bx, yb, bz], { radius: 1.1, taper: 0.8, bury: 0.35, hollow: false, moss: 0, fungi: 0, mushrooms: 0, stubs: 2, ferns: 0, log: 'river_snag', dark: 'river_snagDark', mossLight: 'river_snag', seed: R.int(0, 1e6) });
    for (const [from, to] of [['logCut', 'river_snag'], ['logCutDark', 'river_snagDark'], ['logInside', 'river_snagDark'], ['logMoss', 'river_snag']])   // no brown end grain: bleached all through
      g.replace(from, to, [Math.min(ax, bx) - 4, -14, Math.min(az, bz) - 4], [Math.max(ax, bx) + 4, 30, Math.max(az, bz) + 4]);
    perches.push([Math.round((ax + bx) / 2) + 0.5, topSolid(g, Math.round((ax + bx) / 2), Math.round((az + bz) / 2), 40) + 1, Math.round((az + bz) / 2) + 0.5]);
  }

  // ---- 4b. the pool's still life: where the bathers stand, ripples lapping round them, lotus in the calm corner ----
  const STILL = {
    mother: [-81.5, C.feet(-82, -2), -2, 55], calf: [-72, C.feet(-72, 3), 3.5, 30],
  };
  for (const [k, [ex, , ez, hd]] of Object.entries(STILL)) {
    const baby = k === 'calf', hl = baby ? 4.6 : 8.2, hw = baby ? 2.4 : 4.2, f = [Math.sin(hd * Math.PI / 180), Math.cos(hd * Math.PI / 180)];
    for (let a = 0; a < 2 * Math.PI; a += 0.09) for (const sc of baby ? [1.15, 1.6] : [1.12]) {
      const l = Math.cos(a) * hl * sc, w = Math.sin(a) * hw * sc;
      const x = Math.round(ex + f[0] * l + f[1] * w), z = Math.round(ez + f[1] * l - f[0] * w);
      if (!C.isRiver(x, z) || C.wat[C.I(x, z)] !== POOL_W || g.get(x, POOL_W, z) !== P.id('riverWater')) continue;
      if (hash3(x, 7, z, 21) < (baby ? 0.55 : 0.35)) g.set(x, POOL_W, z, baby && sc < 1.3 && hash3(x, 8, z, 2) < 0.5 ? 'river_foam' : 'river_ripple');
    }
  }
  lilyPads(g, [-91, 3], [-80, 9], { y: POOL_W, coverage: 0.45, flowers: 0.9, seed: 17 });

  // ---- 5. the fallen giant bridging the river ------------------------------------------------------------
  const log = fallenGiant(g, C, R);
  perches.push(log.stub);

  // the tapir's spot: the first gravel (land) cell east of the water near TAPIR, side-on to the tour camera, facing the river
  let tapir = null;
  for (let dz = 0; dz <= 6 && !tapir; dz++) for (const zz of [TAPIR[1] + dz, TAPIR[1] - dz]) {
    for (let x = TAPIR[0] - 4; x <= TAPIR[0] + 8 && !tapir; x++) if (!C.isRiver(x, zz) && C.isRiver(x - 1, zz) && C.isRiver(x - 2, zz) && !C.isRiver(x + 4, zz)) tapir = [x + 2.5, C.feet(x + 2, zz), zz + 0.5, (POI_YAW + 270) % 360];
    if (tapir) break;
  }
  tapir ??= [-66.5, 7, 27.5, 290];
  const tf = [Math.sin(tapir[3] * Math.PI / 180), Math.cos(tapir[3] * Math.PI / 180)];
  let tapirCalf = null;
  for (let d = 7; d <= 10 && !tapirCalf; d += 0.5) {
    const x = tapir[0] - tf[0] * d, z = tapir[2] - tf[1] * d, cx = Math.floor(x), cz = Math.floor(z);
    if (!C.isRiver(cx, cz) && C.feet(cx, cz) <= tapir[1] + 1) tapirCalf = [+x.toFixed(2), C.feet(cx, cz), +z.toFixed(2), tapir[3]];
  }
  tapirCalf ??= [tapir[0] - tf[0] * 7, tapir[1], tapir[2] - tf[1] * 7, tapir[3]];

  // ---- 6. zones by sight lines: the default camera looks from the SE at 27°, so whatever stands in front of the
  // pool, the herd's route and the log must stay low: meadow → scrub (young trees) → forest -----------------------
  // each subject is seen from a camera yaw (default: the piece's); the elephants' tour stop also looks from yaw 0,
  // straight up the lower reach, so the river is a leading line into the pool and the mother shows in profile
  const proj = (yaw) => { const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180); return (x, z) => [c * x - s * z, s * x + c * z]; };
  const P20 = proj(CAMERA.yaw), P0 = proj(POI_YAW);
  const subjects = [{ p: [POOL.x, POOL.z], hw: 16, eye: POOL_W + 3 }, { p: [POOL.x, POOL.z + 9], hw: 12, eye: POOL_W + 2 }, { p: [-64, 2], hw: 8, eye: 9 }, { p: [-72.5, -28], hw: 13, eye: 10 }, { p: [-58, -30], hw: 8, eye: 12 },
    { p: [POOL.x, POOL.z], hw: 14, eye: POOL_W + 3, pr: P0 }, { p: [POOL.x - 2, POOL.z + 8], hw: 11, eye: POOL_W + 2, pr: P0 },
    { p: [tapir[0], tapir[2]], hw: 15, eye: tapir[1] + 3 }];
  for (let s = 10; s < LA; s += 4) { const [x, z] = pointAt(TRAIL_A, s); subjects.push({ p: [x, z], hw: 8, eye: profA(s) + 5 }); }
  for (let s = 0; s < 17; s += 4) { const [x, z] = pointAt(TRAIL_C, s); subjects.push({ p: [x, z], hw: 6, eye: profC(s) + 7 }); }
  for (const o of subjects) { o.pr ??= P20; [o.sx, o.dp] = o.pr(...o.p); }
  const allowH = (x, z) => {
    let h = 99;
    const gy = C.surf(x, z), q20 = P20(x, z), q0 = P0(x, z);
    for (const o of subjects) {
      const [sx, dp] = o.pr === P0 ? q0 : q20, dd = dp - o.dp;
      if (dd > 1 && Math.abs(sx - o.sx) < o.hw) h = Math.min(h, o.eye + 0.5 * dd - gy);
    }
    return h;
  };
  const gap = (x, z) => Math.hypot((x - (LOG.a[0] + 4)) / 9, (z - LOG.a[1]) / 7.5) + N.simplex2(x * 0.12, z * 0.12) * 0.15 < 1;
  const FLOOR_E = { floor: 'river_floorE', floorLitter: 'river_floorLitterE', floorMoss: 'river_floorMossE' };
  const FLOOR_S = { floor: 'river_floorS', floorLitter: 'river_floorLitterS', floorMoss: 'river_floorMossS' };
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const i = C.I(x, z);
    if (C.kind[i]) continue;
    const id = P.defs[g.get(x, C.top[i], z)]?.name ?? '';
    if (!(id in FLOOR_E)) continue;                                     // trails, beaches, banks keep theirs
    const a = allowH(x, z) + N.simplex2(x * 0.09, z * 0.09) * 3;
    const figSide = Math.hypot(x - FIG[0], z - FIG[1]) < 10 && (x - FIG[0]) + (z - FIG[1]) > -3;   // keep the fig's lattice in view
    if (gap(x, z)) C.paint(x, z, 'river_gapFloor');
    else if (figSide) C.paint(x, z, 'river_gapFloor');
    else if (a < 19 || Math.hypot(x - HIDE[0], z - HIDE[1]) < 10 || (z > -6 && a < 32 && riverSide(x, z) > 0)) C.paint(x, z, hash3(x, 5, z, 2) < 0.15 ? 'river_meadowDark' : 'river_meadow');   // the east bank's floor reads
    else if (riverSide(x, z) > 0) C.paint(x, z, a < 27 || z > -6 || (x > -72 && z < -24) ? FLOOR_S[id] : FLOOR_E[id]);   // east bank: low in front
    else if (a < 27) C.paint(x, z, FLOOR_S[id]);
  }

  photoHide(g, C, HIDE, R);
  const nearHide = (x, z, r = 7) => Math.hypot(x - HIDE[0], z - HIDE[1]) < r;
  const nearFig = (x, z) => Math.hypot(x - FIG[0], z - FIG[1]) < 12;
  // ---- 7. the forests -------------------------------------------------------------------------------------
  const figBase = [FIG[0], C.topAt(...FIG) + 1, FIG[1]];
  const forestW = rainforest(g, [x0, z0], [x1, z1], {
    on: ['floor', 'floorLitter', 'floorMoss'], height: [21, 30], density: 0.95, flowering: 0, border: false, emergents: 0, leaves: LEAVES_W, trunk: TRUNK_W,
    avoid: [[[FIG[0] - 7, FIG[1] - 7], [FIG[0] + 7, FIG[1] + 7]], ...ACCENTS.map(([x, z, , r]) => [[x - r, z - r], [x + r, z + r]])], seed: R.int(0, 1e6),
  });
  rainforest(g, [x0, z0], [x1, z1], {
    on: Object.values(FLOOR_E), height: [16, 24], density: 0.9, flowering: 0, border: false, emergents: 0, leaves: LEAVES_W, trunk: TRUNK_W,
    avoid: ACCENTS.map(([x, z, , r]) => [[x - r, z - r], [x + r, z + r]]), seed: R.int(0, 1e6),
  });
  rainforest(g, [x0, z0], [x1, z1], { on: Object.values(FLOOR_S), height: [8, 13], density: 1.1, border: false, emergents: 0, edge: 3, flowering: 0,
    avoid: ACCENTS.map(([x, z, , r]) => [[x - r, z - r], [x + r, z + r]]), seed: R.int(0, 1e6) });
  // the two colour accents framing the elephant beach: a golden-flowered tree and a lilac inthanin (crape myrtle)
  for (const [x, z, h, r, fl] of ACCENTS) jungleTree(g, [x, C.topAt(x, z) + 1, z], { height: h, style: 'round', crownRadius: r + 1.5, flowers: fl, flowerAmount: 0.5, bias: 0, trunk: TRUNK_W, seed: x * 7 + z });
  const fig = strangler(g, figBase, { height: 44, seed: 7, doorAngle: Math.atan2(4, 3), fruitAmount: 0.3 });

  // ---- 8. riverside plants: bamboo, bananas, heliconia, small trees — kept low in front of the pool ----------
  const onLand = (x, z) => C.inside(x, z) && !C.isRiver(x, z) && !nearHide(x, z);
  const at = (x, z) => [x, C.topAt(x, z) + 1, z];
  for (const [x, z, h] of [[-50, 21, 19], [-90, 14, 18], [-61, 33, 15], [-91, 27, 18], [-96, 33, 16]]) {
    if (!onLand(x, z)) continue;
    const hh = Math.min(h, allowH(x, z) - 3);
    if (hh >= 12) bamboo(g, at(x, z), { height: Math.round(hh), seed: R.int(0, 1e6) });
  }
  for (const [x, z] of [[-84, 16], [-92, 18], [-44, 33]]) if (onLand(x, z) && allowH(x, z) > 13) banana(g, at(x, z), { seed: R.int(0, 1e6) });
  for (const [x, z] of [[-62, -6], [-56, -6], [-51, 12], [-86, 10]]) if (onLand(x, z) && allowH(x, z) > 14) heliconia(g, at(x, z), { seed: R.int(0, 1e6) });
  // Kerriodoxa elegans fan palms (Khao Sok's own "white elephant palm") where they hide nothing: open east-bank meadow
  // with enough headroom, away from the hide and the trails; then rattan clumps arching over the bank
  const MEADOW = new Set(['river_meadow', 'river_meadowDark'].map((m) => P.id(m)));
  const palms = [];
  for (let z = -8; z <= 36 && palms.length < 2; z += 2) for (let x = -64; x <= -49 && palms.length < 2; x += 2) {
    if (!onLand(x, z) || !MEADOW.has(g.get(x, C.topAt(x, z), z)) || allowH(x, z) < 9 || nearest(TRAIL_C, x, z).d < 8) continue;
    if (palms.some(([px, pz]) => Math.hypot(px - x, pz - z) < 12) || Math.hypot(x - HIDE[0], z - HIDE[1]) < 10) continue;
    palms.push([x, z]);
  }
  palms.forEach(([x, z], k) => fanPalm(g, at(x, z), k));
  for (const [x, z] of [[-55, 19], [-50, 7], [-52, -4], [-56, 26], [-47, -9]]) {
    const h = Math.min(11, Math.floor(allowH(x, z) - 1));
    if (onLand(x, z) && h >= 6 && !palms.some(([px, pz]) => Math.hypot(px - x, pz - z) < 7)) rattan(g, at(x, z), { height: h, stems: 3, seed: x * 13 + z });
  }
  undergrowth(g, [x0 + 1, z0 + 1], [x1 - 1, z1 - 1], { on: ['river_meadow', 'river_meadowDark'], density: 0.3, seed: R.int(0, 1e6), mix: { fern: 3, alocasia: 0.12, heliconia: 0.1, tuft: 5, flower: 1.4, seedling: 0.8 }, scale: 0.85, avoid: (x, z) => allowH(x, z) < 5 || nearHide(x, z, 6) || nearFig(x, z) || palms.some(([px, pz]) => Math.hypot(px - x, pz - z) < 5) });
  undergrowth(g, [x0 + 1, z0 + 1], [x1 - 1, z1 - 1], { on: ['bank', 'river_gapFloor'], density: 0.7, seed: R.int(0, 1e6), mix: { alocasia: 0.8, heliconia: 0.2, treeFern: 0.1 }, avoid: (x, z) => allowH(x, z) < 5 || nearFig(x, z) });
  undergrowth(g, [FIG[0] - 12, FIG[1] - 12], [FIG[0] + 12, FIG[1] + 12], { on: ['bank', 'river_gapFloor'], density: 0.8, seed: 31, mix: { fern: 4, alocasia: 1.5, heliconia: 0, flower: 0, treeFern: 0.4, seedling: 1 }, avoid: (x, z) => !nearFig(x, z) || allowH(x, z) < 5 });
  grass(g, C, ['river_meadow', 'river_meadowDark', 'river_gapFloor'], 0.16);

  // ---- 8b. little stories: a wildlife photographer's hide on the east bank, elephant dung (+ beetles) on the trails
  for (const [pts, ss] of [[TRAIL_A, [14, 24]], [TRAIL_C, [10]]]) for (const sd of ss) {
    const [px, pz] = pointAt(pts, sd), q = pointAt(pts, sd + 1), side = sd % 2 ? 2.5 : -2.5;
    const dx = q[0] - px, dz = q[1] - pz, l = Math.hypot(dx, dz) || 1;
    const x = Math.round(px - (dz / l) * side), z = Math.round(pz + (dx / l) * side), y = C.topAt(x, z) + 1;
    for (const [i, j, k] of [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 1, 0], [0, 0, -2]]) g.set(x + i, y + j, z + k, j ? 'river_dungDark' : 'river_dung');
    for (const [bx, bz] of [[x - 1, z - 2], [x + 2, z + 2]]) g.set(bx, C.topAt(bx, bz) + 1, bz, 'river_beetle');
  }

  // ---- 9. epiphytes + lianas on the big trees --------------------------------------------------------------
  epiphytes(g, { area: [[figBase[0] - 16, figBase[1] + 4, figBase[2] - 16], [figBase[0] + 16, figBase[1] + 40, figBase[2] + 16]], on: ['figRoot', 'figRootDark'], density: 0.1, mix: { moss: 3, fern: 2, bromeliad: 0.2, orchid: 0.15 }, seed: 3 });
  lianas(g, fig.limbs.concat(fig.tips.slice(0, 3)), { seed: 5, connect: 0.2, chance: 0.8 });
  // lianas dangling from the forest edge over the pool's cut bank and along the west bank
  const edgeTrees = forestW.trees.filter((t) => Math.hypot(t.base[0] - POOL.x, t.base[2] - POOL.z) < 24 && t.base[0] < POOL.x - 6);
  lianas(g, edgeTrees.flatMap((t) => t.limbs.slice(0, 2)), { seed: 9, dangle: 0.45, connect: 0.15, chance: 0.7 });
  epiphytes(g, { area: [[POOL.x - 30, 8, POOL.z - 26], [POOL.x - 8, 45, POOL.z + 26]], on: TRUNK_W, density: 0.06, mix: { moss: 3, fern: 2, bromeliad: 0.3, orchid: 0 }, seed: 11 });

  // ---- 10. white water at the steps of the river (little rapids) ------------------------------------------
  for (let z = z0 + 1; z < z1; z++) for (let x = x0 + 1; x < x1; x++) {
    const i = C.I(x, z);
    if (!C.kind[i]) continue;
    const w = C.wat[i];
    let up = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = C.I(x + dx, z + dz); if (C.kind[j] && C.wat[j] > w) up = true; }
    if (up && g.get(x, w, z) === P.id('riverWater') && hash3(x, w, z, 8) < 0.8) g.set(x, w, z, hash3(x, w, z, 9) < 0.5 ? 'river_foam' : 'river_foamLight');
  }

  // ---- 11. life ---------------------------------------------------------------------------------------------
  // ---- 10b. the monitor lies flat on bare bark: find the log's own top (log materials only) and clear what grew on it
  const LOGM = new Set(['barkPale', 'barkPaleDark', 'logMoss', 'logMossLight', 'logCut', 'logCutDark', 'logInside'].map((m) => P.id(m)));
  { const [mx, mz] = log.mxz; let lt = log.y + 12; while (lt > log.y - 4 && !LOGM.has(g.get(mx, lt, mz))) lt--;
    for (let x = mx - 5; x <= mx + 5; x++) for (let z = mz - 3; z <= mz + 3; z++) for (let yy = lt + 1; yy <= lt + 6; yy++) if (g.get(x, yy, z) && !LOGM.has(g.get(x, yy, z))) g.set(x, yy, z, 0);
    log.mid = [mx + 0.5, lt + 1, mz + 0.5]; }
  const feast = figFeast(g, fig, FIG_YAW);

  life(g, ctx, C, { perches, log, fig, STILL, tapir, tapirCalf, feast });
}

// ---- the fallen giant: a huge mossy trunk spanning the river, its torn-up root plate standing on the east bank ----
function fallenGiant(g, C, R) {
  const [ax, az] = LOG.a, [bx, bz] = LOG.b;
  const ya = C.topAt(ax, az) + 1, yb = C.topAt(bx, bz) + 1;
  const y = Math.max(ya, yb - 1);
  fallenLog(g, [ax, y, az], [bx, y + 1, bz], { radius: 3.2, taper: 0.72, bury: 0.1, hollow: true, moss: 0.5, fungi: 6, mushrooms: 3, stubs: 3, ferns: 2, log: 'barkPale', dark: 'barkPaleDark', seed: 41 });
  // root plate: a lobed disc of red earth + radiating roots, perpendicular to the trunk, standing up at the east end
  const ux = bx - ax, uz = bz - az, L = Math.hypot(ux, uz), u = [ux / L, uz / L], v = [-u[1], u[0]];
  const c = [ax - u[0] * 1.2, y + 2.5, az - u[1] * 1.2];
  const Rp = (a) => 7.6 + 1.1 * Math.sin(3 * a + 1) + 0.6 * Math.sin(7 * a + 2) + 0.4 * Math.sin(13 * a);
  const strand = (a) => { const k = (a / (2 * Math.PI)) * 11 + 0.3 * Math.sin(a * 3); return Math.abs(k - Math.round(k)) < 0.17; };
  for (let yy = Math.floor(c[1] - 10); yy <= c[1] + 10; yy++) for (let z = Math.floor(c[2] - 11); z <= c[2] + 11; z++) for (let x = Math.floor(c[0] - 11); x <= c[0] + 11; x++) {
    const px = x + 0.5 - c[0], pz = z + 0.5 - c[2], dy = yy + 0.5 - c[1];
    const t = px * u[0] + pz * u[1], sv = px * v[0] + pz * v[1];
    const rho = Math.hypot(sv, dy), a = Math.atan2(dy, sv), R0 = Rp(a);
    if (rho > R0 || Math.abs(t + 0.2) > 1.3 + 1.1 * (1 - rho / R0)) continue;
    if (!C.inside(x, z) || yy <= C.topAt(x, z) - 1) continue;
    const face = t < -0.4, edge = rho > R0 - 1.1;
    let m;
    if (edge) m = hash3(x, yy, z, 6) < 0.5 ? 'river_root' : 'river_rootDark';
    else if (face) m = strand(a) && rho > 1.8 ? 'river_root' : rho < R0 * 0.5 ? (hash3(x, yy, z, 4) < 0.35 ? 'river_rootSoilDark' : 'river_rootSoil') : hash3(x, yy, z, 5) < 0.5 ? 'river_rootSoilDark' : 'river_rootSoil';
    else m = strand(a) ? 'river_rootDark' : 'river_rootSoil';
    g.set(x, yy, z, m);
  }
  // long roots poking out past the rim, some drooping, and fine dangling rootlets
  for (let k = 0; k < 15; k++) {
    const a = (k / 15) * 2 * Math.PI + R.range(-0.15, 0.15);
    if (Math.sin(a) < -0.55) continue;                                   // not into the ground
    const r0 = Rp(a) - 0.5, len = R.range(2, 4.5), droop = Math.cos(a) * 0.2 - 0.25;
    for (let j = 0; j <= len * 2; j++) {
      const r = r0 + j * 0.5, x = Math.round(c[0] + v[0] * Math.cos(a) * r - u[0] * (0.5 + j * 0.15)), z = Math.round(c[2] + v[1] * Math.cos(a) * r - u[1] * (0.5 + j * 0.15));
      const yy = Math.round(c[1] + Math.sin(a) * r + droop * j * 0.5);
      if (C.inside(x, z) && yy > C.topAt(x, z)) g.set(x, yy, z, j > len * 1.6 ? 'river_rootDark' : 'river_root');
    }
  }
  for (let k = 0; k < 18; k++) {
    const a = R.range(-Math.PI * 0.85, -Math.PI * 0.15), r = R.range(2, Rp(a) - 0.5);   // under the lower half: rootlets hang from the face
    const x = Math.round(c[0] + v[0] * Math.cos(a) * r - u[0] * 1.6), z = Math.round(c[2] + v[1] * Math.cos(a) * r - u[1] * 1.6);
    let yy = Math.round(c[1] + Math.sin(a) * r) - 1;
    for (let j = R.int(1, 3); j > 0 && C.inside(x, z) && yy > C.topAt(x, z); j--, yy--) if (!g.get(x, yy, z)) g.set(x, yy, z, 'river_rootDark');
  }
  // ferns and grass growing on the plate's top edge
  for (let k = 0; k < 7; k++) {
    const a = Math.PI / 2 + R.range(-1.1, 1.1), r = Rp(a);
    const x = Math.round(c[0] + v[0] * Math.cos(a) * (r - 1)), z = Math.round(c[2] + v[1] * Math.cos(a) * (r - 1));
    const yy = topSolid(g, x, z, Math.round(c[1] + 12)) + 1;
    if (k < 3) fern(g, [x, yy, z], { radius: 1.6, height: 1.6, fronds: 5, seed: k + 3 });
    else g.set(x, yy, z, 'river_grassLight');
  }
  // the crater the roots tore out of the bank: a muddy puddle east of the plate
  for (let z = Math.round(az - 5); z <= az + 5; z++) for (let x = Math.round(ax - u[0] * 3 - 4); x <= ax - u[0] * 3 + 4; x++) {
    const d = Math.hypot((x - (ax - u[0] * 4.5)) / 3.6, (z - (az - u[1] * 4.5)) / 4.6);
    if (d > 1 || !C.inside(x, z) || C.isRiver(x, z)) continue;
    const t = C.topAt(x, z), dd = d < 0.6 ? 2 : 1;
    C.set(x, z, t - dd, d < 0.55 ? 'river_puddle' : 'river_mudWet');
  }
  // top of the trunk at its middle (monitor lizard spot) + a stub perch
  const mx = Math.round(ax + ux * 0.55), mz = Math.round(az + uz * 0.55);
  const mt = topSolid(g, mx, mz, y + 12);
  const sx = Math.round(ax + ux * 0.3), sz = Math.round(az + uz * 0.3);
  return { a: [ax, y, az], b: [bx, y + 1, bz], y, mxz: [mx, mz], mid: [mx + 0.5, mt + 1, mz + 0.5], heading: Math.atan2(ux, uz) * 180 / Math.PI, stub: [sx + 0.5, topSolid(g, sx, sz, y + 14) + 1, sz + 0.5], plate: c };
}

// ---- riverside grass: swaying tufts on the meadow ------------------------------------------------------------
function grass(g, C, on, density) {
  const P = g.palette, ids = new Set(on.map((m) => P.id(m)));
  for (let z = C.z0; z <= C.z1; z++) for (let x = C.x0; x <= C.x1; x++) {
    const i = C.I(x, z);
    if (C.kind[i]) continue;
    const t = C.top[i];
    if (!ids.has(g.get(x, t, z)) || g.get(x, t + 1, z) || hash3(x, t, z, 31) > density) continue;
    const h = hash3(x, t, z, 32) < 0.3 ? 2 : 1;
    for (let k = 1; k <= h; k++) g.set(x, t + k, z, hash3(x, t + k, z, 33) < 0.18 ? 'river_grassDry' : k === h ? 'river_grassLight' : 'river_grass');
  }
}

// ---- a camouflaged wildlife photographer's hide: bamboo frame, leaf-mat walls, thatch roof, a long lens poking out --
function photoHide(g, C, [hx, hz], R) {
  let y0 = -99;
  for (let z = hz - 3; z <= hz + 3; z++) for (let x = hx - 3; x <= hx + 3; x++) y0 = Math.max(y0, C.topAt(x, z) + 1);
  g.box([hx - 4, y0, hz - 4], [hx + 4, y0 + 8, hz + 4], 0);
  for (let z = hz - 3; z <= hz + 3; z++) for (let x = hx - 3; x <= hx + 3; x++) { const t = C.topAt(x, z); for (let y = t + 1; y < y0; y++) g.set(x, y, z, 'soil'); g.set(x, y0 - 1, z, Math.abs(x - hx) < 3 && Math.abs(z - hz) < 3 ? 'floorLitter' : 'river_meadow'); }
  for (const [x, z] of [[hx - 2, hz - 2], [hx - 2, hz + 2], [hx + 2, hz - 2], [hx + 2, hz + 2]]) for (let y = y0; y <= y0 + 3; y++) g.set(x, y, z, 'bambooPole');
  // walls on the far sides only: the open back (+x) and the low +z side let you peek in at the photographer
  for (let y = y0; y <= y0 + 2; y++) for (let k = -1; k <= 1; k++) { g.set(hx + k, y, hz - 2, 'bambooMatDark'); if (y === y0) g.set(hx + k, y, hz + 2, 'bambooMatDark'); }
  g.set(hx + 2, y0, hz - 1, 'bambooMat');
  for (let k = -1; k <= 1; k++) { g.set(hx - 2, y0, hz + k, 'bambooMat'); g.set(hx - 2, y0 + 3, hz + k, 'bambooMat'); }
  for (let z = hz - 3; z <= hz + 3; z++) for (let x = hx - 3; x <= hx + 3; x++) {
    g.set(x, y0 + 4, z, hash3(x, 1, z, 3) < 0.5 ? 'thatchPalm' : 'thatchPalmDark');
    if (hash3(x, 2, z, 4) < 0.35) g.set(x, y0 + 5, z, hash3(x, 3, z, 5) < 0.5 ? 'jungleLeaf' : 'jungleLeafDark');   // leafy camouflage
  }
  for (const [x, z] of [[hx + 3, hz - 2], [hx - 1, hz + 3], [hx + 1, hz - 3], [hx - 3, hz - 2]]) for (let y = y0; y <= y0 + 2; y++) if (hash3(x, y, z, 6) < 0.8) g.set(x, y, z, 'jungleLeafDark');
  person(g, [hx - 1, y0, hz], { side: '-x', pose: 'sit', shirt: '#5a6a3a', pants: '#4a4434', hat: '#6a6a3e', seed: 12 });
  for (let x = hx - 4; x <= hx - 2; x++) g.set(x, y0 + 2, hz, x === hx - 4 ? 'river_lensGlass' : 'river_lens');   // the long lens through the slit
  g.set(hx - 1, y0 + 2, hz + 1, 'river_lens');
  g.set(hx + 1, y0, hz + 1, 'fabricRed'); g.set(hx + 1, y0 + 1, hz + 1, 'fabricRed');   // backpack
  g.set(hx + 1, y0, hz - 1, 'metalDark'); g.set(hx + 3, y0, hz + 1, 'river_lensGlass');  // thermos, a spare lens cap glinting
  return [hx, y0, hz];
}

// ---- Kerriodoxa elegans: a short dark trunk under a ring of big round fans, dark green above, silver-white beneath ----
function fanPalm(g, [x, y, z], k) {
  const h = 3 + k, cy = y + h;
  for (let i = 0; i < h; i++) g.set(x, y + i, z, i === h - 1 ? 'river_palmCollar' : 'river_palmTrunk');
  const n = 9 + k;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI + k * 0.3 + (hash3(i, k, 3, 7) - 0.5) * 0.3, ux = Math.cos(a), uz = Math.sin(a);
    g.put(Math.round(x + ux), cy, Math.round(z + uz), 'river_palmStem', 'keep');
    const tier = i % 2;                                                 // alternate leaves sit a step higher: separate fans
    for (let r = 2; r <= 6; r++) {                                     // the fan: a 5-cell wedge, widening to 3, drooping at the rim
      const w = r <= 3 ? 0 : 1, py = cy + tier + (r <= 4 ? 1 : r === 5 ? 0 : -1);
      for (let c = -w; c <= w; c++) {
        const px = Math.round(x + ux * r - uz * c), pz = Math.round(z + uz * r + ux * c);
        g.put(px, py, pz, c === 0 && r < 6 ? 'river_palmLeafLight' : tier ? 'river_palmLeaf' : 'river_palmLeafDark', 'keep');
        if (r >= 4) g.put(px, py - 1, pz, 'river_palmUnder', 'keep');   // the silver underside shows where the fan droops
      }
    }
  }
  g.set(x, cy, z, 'river_palmLeafLight'); g.set(x, cy + 1, z, 'river_palmLeafLight'); g.set(x, cy + 2, z, 'river_palmLeaf');   // the spear of a new leaf
}

// ---- two hornbills feeding face to face on the fig's camera-side crown rim (a ripe fig in one bill) ---------------
function figFeast(g, fig, yaw) {
  const P = g.palette, LEAF = new Set(['canopyBlue', 'jungleLeafDark', 'jungleLeaf', 'jungleLeafLight', 'figFruit'].map((m) => P.id(m)));
  const [cx, , cz] = fig.base, Rc = fig.crownRadius, y0 = fig.crownY;
  // the outermost leaf top with headroom along direction a (radians, x = cos, z = sin), at about crown-rim height
  const seatAt = (a) => {
    for (let r = Rc + 2; r > Rc * 0.45; r -= 0.5) {
      const x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r);
      for (let y = y0 + 7; y >= y0 - 2; y--) if (LEAF.has(g.get(x, y, z)) && !g.get(x, y + 1, z) && !g.get(x, y + 2, z) && !g.get(x, y + 3, z)) return [x, y + 1, z];
    }
    return null;
  };
  const a0 = Math.atan2(Math.cos(yaw * Math.PI / 180), Math.sin(yaw * Math.PI / 180));   // toward the camera
  const A = seatAt(a0 - 0.36) ?? seatAt(a0 - 0.6), B = seatAt(a0 + 0.36) ?? seatAt(a0 + 0.6);
  if (!A || !B) return [];
  const hAB = Math.atan2(B[0] - A[0], B[2] - A[2]) * 180 / Math.PI;
  // a little room for the birds: no leaves through their bodies or between their bills
  for (const [x, y, z] of [A, B]) for (let yy = y; yy <= y + 3; yy++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (LEAF.has(g.get(x + i, yy, z + j))) g.set(x + i, yy, z + j, 0);
  const n = Math.ceil(Math.hypot(B[0] - A[0], B[2] - A[2]));
  for (let k = 0; k <= n; k++) { const x = Math.round(A[0] + (B[0] - A[0]) * k / n), z = Math.round(A[2] + (B[2] - A[2]) * k / n), yb = Math.round(A[1] + (B[1] - A[1]) * k / n); for (let yy = yb + 1; yy <= yb + 3; yy++) if (LEAF.has(g.get(x, yy, z))) g.set(x, yy, z, 0); }
  // the fig in A's bill (bill tip ≈ 3.6 ahead, 2.3 up of a perched hornbill)
  const f = [Math.sin(hAB * Math.PI / 180), Math.cos(hAB * Math.PI / 180)];
  g.set(Math.floor(A[0] + 0.5 + f[0] * 3.6), A[1] + 2, Math.floor(A[2] + 0.5 + f[1] * 3.6), 'figFruit');
  return [[A[0] + 0.5, A[1], A[2] + 0.5, hAB], [B[0] + 0.5, B[1], B[2] + 0.5, (hAB + 180) % 360]];
}

function topSolid(g, x, z, from) { for (let y = from; y > -14; y--) if (g.get(x, y, z)) return y; return 0; }

// ---- life: the herd, the pool family, birds, the monitor, butterflies, fish, otters, the tapir ------------------
function life(g, ctx, C, { perches, log, fig, STILL, tapir, tapirCalf, feast }) {
  const E = (o) => ctx.emit('actors', o);
  // the crossing herd: 3 adults + a calf walking in step along one 3D route (y from the trail / the pool bed). Both
  // paths have the same length so they stay in step forever: adults walk s = 9…L, the calf s = 0…L−9 (9 behind adult 0);
  // both ends (trail A's top, trail C's tail) are under the forest canopy, where they grow in / shrink out.
  const L = polyLen(ROUTE);
  const route3 = (s0, s1) => {
    const pts = [];
    for (let s = s0; s <= s1 + 1e-6; s += 1.5) { const [x, z] = pointAt(ROUTE, s); pts.push([x, C.feet(x, z), z]); }
    const ys = pts.map((p) => p[1]);
    return pts.map((p, i) => { let a = 0, n = 0; for (let k = -2; k <= 2; k++) { const y = ys[i + k]; if (y != null) { a += y; n++; } } return [+p[0].toFixed(2), +(a / n).toFixed(2), +p[2].toFixed(2)]; });
  };
  const SPEED = 1.1, SKIN = '#8d939c';   // wet slate grey (lib elephant `skin`): reads as elephant, not as a brown mound
  E({ creature: 'elephant', id: 'river_herd', behavior: 'path', loop: 'restart', path: route3(9, L), count: 3, variants: 2, speed: SPEED, seed: 11, options: { skin: SKIN } });
  E({ creature: 'elephant', id: 'river_herdCalf', options: { baby: true, skin: SKIN }, behavior: 'path', loop: 'restart', path: route3(0, L - 9), count: 1, speed: SPEED, seed: 12 });
  // the pool: a mother showering her calf (the spray falls on the calf from her raised trunk)
  const { mother, calf } = STILL;
  E({ creature: 'elephant', behavior: 'still', spots: [mother], options: { seed: 5, tusks: false, skin: SKIN } });
  E({ creature: 'elephant', options: { baby: true, seed: 3, skin: SKIN }, behavior: 'still', spots: [calf] });
  ctx.emit('particles', { count: 90, motion: 'fall', shape: 'soft', colors: ['#ffffff', '#e4f6ff', '#f4fbff'], size: 0.36, sizeJitter: 0.7, glow: 1.6, speed: 2.4, sway: 0.6, turbulence: 0.9, opacity: 0.75, fade: 0.25,
    box: [[calf[0] - 3, POOL_W + 1, calf[2] - 4], [calf[0] + 2, POOL_W + 12, calf[2] + 2]] });
  // kingfishers darting between boulders, driftwood and the log: one upstream (rapids + log), two downstream
  E({ ...LIFE.kingfisher, spots: perches.filter((p) => p[2] < -14), count: 1 });
  E({ ...LIFE.kingfisher, spots: perches.filter((p) => p[2] >= -14), count: 2 });
  // a water monitor sunning on the fallen giant
  E({ ...LIFE.monitor, spots: [[log.mid[0], log.mid[1], log.mid[2], log.heading + 15]] });
  // a pair of otters fishing in the lower reach
  E({ creature: 'otter', on: 'water', behavior: 'wander', area: [[-77, 13], [-62, 37]], count: 2, seed: 7 });
  // a tight puddling cluster of sulphurs on the wet gravel beside the tapir (none over water or on the animals)
  const GRAV = new Set(['river_gravel', 'river_gravelWet', 'river_sand'].map((m) => g.palette.id(m)));
  const puddle = [];
  for (let r = 0; r <= 4 && puddle.length < 14; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || puddle.length >= 14) continue;
    const x = Math.round((tapir[0] + tapirCalf[0]) / 2 + 3) + dx, z = Math.round((tapir[2] + tapirCalf[2]) / 2 + 3) + dz;
    if (Math.hypot(x + 0.5 - tapir[0], z + 0.5 - tapir[2]) < 4 || Math.hypot(x + 0.5 - tapirCalf[0], z + 0.5 - tapirCalf[2]) < 3) continue;
    if (!C.inside(x, z) || C.isRiver(x, z) || !GRAV.has(g.get(x, C.topAt(x, z), z)) || g.get(x, C.topAt(x, z) + 1, z) || hash3(x, 3, z, 77) < 0.35) continue;
    puddle.push([x + 0.5, C.topAt(x, z) + 1, z + 0.5, Math.round(hash3(x, 4, z, 78) * 360)]);
  }
  if (puddle.length) E({ creature: 'butterfly', options: { color: '#f6f3e6' }, tints: ['#ffffff', '#fbe98a'], behavior: 'hop', spots: puddle, count: Math.min(9, puddle.length - 2), arc: 0.6, idle: [4, 12] });
  // fish in the pool
  E({ ...LIFE.fish, count: 8, area: [[-86, -12], [-70, 4]] });
  // hornbills feeding in the fig
  // two feeding face to face on the crown edge (two birds, two seats: neither ever has a free perch, so they stay),
  // a third hopping over the crown top
  if (feast.length) E({ ...LIFE.hornbillHop, count: 2, spots: feast });
  E({ ...LIFE.hornbillHop, count: 1, spots: fig.tips.slice(2, 6).map((t) => [t[0] + 0.5, topSolid(g, t[0], t[2], 120) + 1, t[2] + 0.5]) });
  // a Malayan tapir at the waterline of the lower gravel bar, side-on to the camera (snout over the water)
  E({ creature: 'tapir', behavior: 'still', spots: [tapir] });
  // her 'watermelon' calf trailing her on the dry gravel, side-on too (behind her rump, so both read in profile)
  E({ creature: 'tapir', options: { baby: true }, behavior: 'still', spots: [tapirCalf] });
  // morning haze lying low over the upstream river
  ctx.emit('particles', { preset: 'mist', motion: 'drift', count: 26, size: 10, sizeJitter: 0.35, glow: 1, colors: ['#ffffff', '#f6efe4'], opacity: 0.12, speed: 0.04, box: [[-80, 8, -39], [-62, 11, -14]] });
  // points of interest
  const poi = (label, icon, target, zoom, yaw, pitch) => ctx.emit('poi', { label, icon, target, zoom, ...(yaw != null ? { yaw } : {}), ...(pitch != null ? { pitch } : {}) });
  poi('Elephant bath & river crossing', '🐘', [-79, 9, -6], 6, POI_YAW);
  poi('Fallen giant & water monitor', '🦎', [log.mid[0], log.mid[1] + 1, log.mid[2]], 10);
  const fm = feast.length ? [(feast[0][0] + feast[1][0]) / 2, (feast[0][1] + feast[1][1]) / 2, (feast[0][2] + feast[1][2]) / 2] : [FIG[0] + 2, fig.crownY, FIG[1] + 2];
  poi('Hornbills feasting on figs', '🐦', [Math.max(fm[0] + 3, -96), fm[1], fm[2]], 9, FIG_YAW, 40);   // focus on the fig itself (frame stays inside the world)
  poi('Tapir & calf at the water', '🐾', [(tapir[0] + tapirCalf[0]) / 2, tapir[1] + 2, (tapir[2] + tapirCalf[2]) / 2], 8, POI_YAW);
}

function materials(P) {
  const add = (n, d) => { if (!P.has(n)) P.add(n, d); };
  for (const k of ['E', 'S']) { add(`river_floor${k}`, PAL.floor); add(`river_floorLitter${k}`, PAL.floorLitter); add(`river_floorMoss${k}`, PAL.floorMoss); }
  add('river_mud', { colors: ['#4e3826', '#573f2b', '#463222'], jitter: 0.05 });
  add('river_mudWet', { colors: ['#3a2a1c', '#412f20'], jitter: 0.04, roughness: 0.4 });
  add('river_print', { color: '#33251a', jitter: 0.04, roughness: 0.35 });
  add('river_puddle', { color: '#4a6a62', jitter: 0.03, roughness: 0.12, metalness: 0.1 });
  add('river_gravel', { colors: ['#d6c6a2', '#c4b28e', '#e2d4b4', '#b09c7e'], jitter: 0.06 });
  add('river_gravelWet', { colors: ['#8a806e', '#7a7262', '#9a8f7a', '#6c645a'], jitter: 0.05, roughness: 0.45 });
  add('river_sand', { colors: ['#d8c69c', '#cdbb8f', '#e0d0a8'], jitter: 0.04 });
  add('river_silt', { color: '#5e5440', jitter: 0.05 });
  add('river_siltDark', { color: '#4c4434', jitter: 0.05 });
  add('river_foam', { colors: ['#f2f8f4', '#e8f2ee'], jitter: 0.03, roughness: 0.7 });
  add('river_foamLight', { color: '#cfe6dc', jitter: 0.04, roughness: 0.5 });
  add('river_meadow', { colors: ['#5c8a32', '#679536', '#54802e'], jitter: 0.05, noise: { color: '#76a03e', scale: 0.15, amount: 0.5 } });
  add('river_meadowDark', { colors: ['#4a7428', '#517c2c'], jitter: 0.05 });
  add('river_gapFloor', { colors: ['#56692e', '#62702f', '#6a6a34', '#5a6430'], jitter: 0.06 });
  add('river_grass', { colors: ['#5f9636', '#6aa03c'], jitter: 0.06, sway: 0.9 });
  add('river_grassLight', { colors: ['#86b84a', '#94c050'], jitter: 0.06, sway: 1 });
  add('river_grassDry', { colors: ['#b4a85a', '#c2b468'], jitter: 0.06, sway: 1 });
  add('river_rootSoil', { color: '#8e4e34', jitter: 0.06, noise: { color: '#6e3a26', scale: 0.3, amount: 0.6 } });
  add('river_rootSoilDark', { color: '#5a3424', jitter: 0.05 });
  add('river_root', { colors: ['#9a8468', '#8a745a', '#a89276'], jitter: 0.06 });
  add('river_rootDark', { colors: ['#5e4c38', '#6a5640'], jitter: 0.05 });
  add('river_inthanin', { color: '#b46ac4', jitter: 0.06, sway: 0.3 });
  add('river_inthaninLight', { color: '#d69ade', jitter: 0.05, sway: 0.3 });
  add('river_dung', { colors: ['#6a5a30', '#5e5028'], jitter: 0.06 });
  add('river_dungDark', { color: '#4a3e20', jitter: 0.05 });
  add('river_beetle', { color: '#1a1a14', roughness: 0.3, metalness: 0.3 });
  add('river_lens', { color: '#1c1c1e', roughness: 0.35, metalness: 0.4 });
  add('river_lensGlass', { color: '#4a6a8a', roughness: 0.1, metalness: 0.6 });
  add('river_palmTrunk', { color: '#3e3226', jitter: 0.06 });
  add('river_palmCollar', { color: '#7a5a34', jitter: 0.06 });
  add('river_palmStem', { color: '#6a6238', jitter: 0.05 });
  add('river_palmLeaf', { colors: ['#24502a', '#2a5a2e'], jitter: 0.05, sway: 0.3 });
  add('river_palmLeafDark', { colors: ['#1c4424', '#214a28'], jitter: 0.05, sway: 0.3 });
  add('river_palmLeafLight', { color: '#3e7034', jitter: 0.05, sway: 0.3 });
  add('river_palmUnder', { color: '#ccd6c8', jitter: 0.04, sway: 0.3 });
  add('river_snag', { color: '#a9a59b', jitter: 0.05, noise: { color: '#96928a', scale: 0.35, amount: 0.5 } });   // weathered silver-grey driftwood
  add('river_snagDark', { color: '#7e7a72', jitter: 0.05 });
  add('river_ripple', { colors: ['#b8ded4', '#c8e6dc'], jitter: 0.03, roughness: 0.2 });
}
