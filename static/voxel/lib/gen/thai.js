// Thai rural / jungle-lake structures: floating raft houses, long-tail boats, spirit houses, tree houses,
// rope bridges, kayaks, floating walkways, pavilions. Same conventions as build.js: fn(g, p, o), sides
// '+x' | '-x' | '+z' | '-z', `seed`/`R`, material overrides.
//
//   const P = new Palette({ ...NATURE, ...BUILD, ...THAI });
//   const h = raftHouse(g, [0, 0, 0], { side: '+z' });            // water surface at y = 0, deck at y = 1
//   longtail(g, h.mooring, { dir: h.mooringDir, passengers: 2 });
//   spiritHouse(g, [8, 1, 4]);   const t = treeHouse(g, [20, 1, 0], { height: 18 });  ropeBridge(g, t.bridgeAnchors[0], b);
//
// Water-borne pieces take p = [x, waterY, z] where waterY is the TOP water voxel: decks sit at waterY + 1, hulls
// sink a voxel or two below it (and clear any water inside them).
import { rng, hash3, clamp } from '../random.js';
import { defineGenerator, defineCreature } from '../registry.js';
import { VoxelGrid } from '../grid.js';
import { Palette } from '../palette.js';
import { rig } from '../actors.js';
import { person, BUILD } from './build.js';
import { foliage, NATURE } from './nature.js';

/** Default materials for the Thai structures. Spread into your palette and override freely. */
export const THAI = {
  bambooPole: { color: '#c8b070', jitter: 0.05 },          // cut, dried bamboo
  bambooPoleDark: { color: '#a08850', jitter: 0.05 },
  bambooMat: { color: '#d8c08a', jitter: 0.05, grid: 0.25 }, // woven bamboo wall panels
  bambooMatDark: { color: '#c4a872', jitter: 0.05, grid: 0.25 },
  thatchPalm: { color: '#94784a', jitter: 0.08, noise: { color: '#7a623c', scale: 0.35, amount: 0.6 } }, // atap roof
  thatchPalmDark: { color: '#5e4a2e', jitter: 0.07 },
  thatchPalmLight: { color: '#ae9260', jitter: 0.08 },
  tinRoof: { color: '#8a9aa8', jitter: 0.04, metalness: 0.4, roughness: 0.5, grid: 0.3 },
  tinRoofDark: { color: '#6e7e8c', jitter: 0.04, metalness: 0.4, roughness: 0.5, grid: 0.3 },
  tinRoofRust: { color: '#a86a4a', jitter: 0.06 },
  raftFloat: { color: '#3c72b8', jitter: 0.04 },           // blue plastic floats under the rafts
  raftFloatDark: { color: '#2a4268', jitter: 0.04 },
  longtailHull: { color: '#7a4a2a', jitter: 0.05 },
  longtailHullDark: { color: '#5a3420', jitter: 0.05 },
  longtailPaint: { color: '#2a7ab0', jitter: 0.04 },
  ribbonRed: { color: '#e8303a', jitter: 0.03 },
  ribbonYellow: { color: '#f0d030', jitter: 0.03 },
  ribbonPink: { color: '#f070b0', jitter: 0.03 },
  ribbonGreen: { color: '#40c060', jitter: 0.03 },
  marigold: { color: '#f0a020', jitter: 0.05 },
  engineMetal: { color: '#8a8a8a', jitter: 0.03, metalness: 0.6, roughness: 0.4 },
  templeRed: { color: '#b02a2a', jitter: 0.03 },
  templeGold: { color: '#e0b040', jitter: 0.03, metalness: 0.7, roughness: 0.35 },
  templeWhite: { color: '#f0ece0', jitter: 0.02 },
  templeGreen: { color: '#2e7a4e', jitter: 0.03 },          // green border tiles of temple roofs
  hammock: { color: '#d84a3a', jitter: 0.04 },
  kayakOrange: { color: '#f07a20', jitter: 0.03 },
  kayakYellow: { color: '#f0c830', jitter: 0.03 },
  lifeVest: { color: '#f0501e', jitter: 0.03 },
  lanternGlow: { color: '#ffd890', emissive: 4, light: { color: '#ffc070', radius: 7, intensity: 0.9 } },
  fiberRope: { color: '#5e4a30', jitter: 0.05 },            // rope bridges, hammock ties, mooring lines
  sodaRed: { color: '#e8102a', jitter: 0.02, roughness: 0.3 }, // the red soda bottles offered at spirit houses
  incense: { color: '#7a2e22', jitter: 0.03 },
  incenseTip: { color: '#ff9a50', emissive: 1.2 },
  thaiClay: { color: '#b4643c', jitter: 0.05 },             // terracotta pots
};

const DIRS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
const sideOf = (x, z) => (Math.abs(x) >= Math.abs(z) ? (x > 0 ? '+x' : '-x') : z > 0 ? '+z' : '-z');
const R_ = (o) => o.R ?? rng(o.seed ?? 1);
const isWet = (g, id) => { if (!id) return false; const d = g.palette?.def(id); return d?.src?.kind === 'water' || d?.kind === 'water'; }; // def.kind is numeric (KIND); src keeps the name

/**
 * Local frame helper: v = forward (toward `dir`), u = across (to the right), y = up from p[1]. All the generators
 * below are modelled facing +v and rotated by this (a proper rotation, never a mirror).
 */
function frame(g, p, dir = '+z', mode) {
  const [fx, fz] = DIRS[dir] ?? DIRS['+z'], rx = -fz, rz = fx;
  const X = (u, v) => p[0] + fx * v + rx * u, Z = (u, v) => p[2] + fz * v + rz * u;
  const res = (m, u, y, v) => (typeof m === 'function' ? m(u, y, v) : m);
  const F = {
    at: (u, y, v) => [X(u, v), p[1] + y, Z(u, v)],
    put(u, y, v, m, md = mode) { m = res(m, u, y, v); if (m) g.put(X(u, v), p[1] + y, Z(u, v), m, md); },
    set(u, y, v, m) { g.set(X(u, v), p[1] + y, Z(u, v), m ? g.mat(m) : 0); },
    get: (u, y, v) => g.get(X(u, v), p[1] + y, Z(u, v)),
    box(u0, y0, v0, u1, y1, v1, m, md = mode) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let u = Math.min(u0, u1); u <= Math.max(u0, u1); u++)
        for (let v = Math.min(v0, v1); v <= Math.max(v0, v1); v++) F.put(u, y, v, m, md);
    },
    line(a, b, m, md = mode) {
      const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]), 1);
      for (let i = 0; i <= n; i++) { const t = i / n; F.put(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), m, md); }
    },
    side: (du, dv) => sideOf(fx * dv + rx * du, fz * dv + rz * du), // world side name of a local direction
    /** build.js person on local cells (u, v) + (u + 1, v) facing local +v (dv = 1) or -v (dv = -1) */
    person(u, y, v, dv, opts = {}) {
      const a = F.at(u, y, v), b = F.at(u + 1, y, v);
      person(g, [Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2])], { ...opts, side: F.side(0, dv) });
    },
  };
  return F;
}

/**
 * Gable roof in a local frame, ridge along v. u0..u1 / v0..v1 include the overhang; y = eave row.
 * o: slope (1.5), thick (2), mat(u, y, v, info) → id where info = { e, top, eMax, end }, gable (id) +
 * gableRows ([v…]) + gableFrom (y) + gableU ([ua, ub]) fill the triangles under the roof at those rows.
 * Returns the ridge top y.
 */
function gableRoof(F, u0, u1, v0, v1, y, o) {
  const slope = o.slope ?? 1.5, t = o.thick ?? 2;
  const eMax = Math.floor((u1 - u0) / 2);
  const hOf = (e) => Math.floor(e * slope + 1e-6);
  for (let u = u0; u <= u1; u++) {
    const e = Math.min(u - u0, u1 - u), top = y + hOf(e);
    for (let v = v0; v <= v1; v++) for (let yy = Math.max(y, top - t + 1); yy <= top; yy++)
      F.put(u, yy, v, o.mat(u, yy, v, { e, top: yy === top, eMax, end: v === v0 || v === v1 }));
    if (o.gable) for (const gv of o.gableRows ?? []) {
      if (u < (o.gableU?.[0] ?? -1e9) || u > (o.gableU?.[1] ?? 1e9)) continue;
      for (let yy = o.gableFrom ?? y; yy < top - t + 1; yy++) F.put(u, yy, gv, typeof o.gable === 'function' ? o.gable(u, yy, gv) : o.gable, 'keep');
    }
  }
  return y + hOf(eMax);
}

/** Bamboo railing along local cells: posts at the ends and every 3, a top rail at y + h − 1 (h = 2). */
function railing(F, cells, y, o = {}) {
  const post = o.post ?? 'bambooPoleDark', rail = o.rail ?? 'bambooPole', h = o.h ?? 2;
  cells.forEach(([u, v], i) => {
    if (i === 0 || i === cells.length - 1 || i % 3 === 0) F.box(u, y, v, u, y + h - 1, v, post);
    else F.put(u, y + h - 1, v, rail);
  });
}
/** atap thatch shade for a roof cell: streaks running down the slope (by v), darker toward the eave */
const thatchShade = (u, y, v, e, seed) => {
  const h = hash3(v, e >> 1, 0, seed) + (e === 0 ? 0.35 : 0);
  return h < 0.3 ? 'thatchPalmLight' : h < 0.85 ? 'thatchPalm' : 'thatchPalmDark';
};
const run = (a, b, fixed, alongU) => { const out = []; const s = Math.sign(b - a) || 1; for (let i = a; i !== b + s; i += s) out.push(alongU ? [i, fixed] : [fixed, i]); return out; };

/** small potted plant (pot + leaves), local frame */
function pottedPlant(F, u, y, v, R, o = {}) {
  F.put(u, y, v, o.pot ?? 'thaiClay');
  F.put(u, y + 1, v, 'leaf');
  F.put(u, y + 2, v, R.chance(0.5) ? 'leafLight' : R.pick(['petalRed', 'marigold', 'ribbonPink']));
  const [du, dv] = R.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  if (!F.get(u + du, y + 1, v + dv)) F.put(u + du, y + 1, v + dv, 'leafDark');
}

/**
 * Cheow Lan floating raft bungalow. p = [x, waterY, z] = raft centre on the water surface (top water voxel); the deck
 * is at waterY + 1, bamboo bundles (sides) and blue barrels (front/back) float in the water's top layer around it.
 * opts: side (door/porch faces, '+z'), w (hut width across, 7), d (hut depth, 6), wallH (6), roof ('thatch' | 'tin'),
 *       porch (depth, 6; 0 = none), hammock (true), lit (true: porch lantern + warm interior glow; false), ladder (true),
 *       laundry (true), moor ('left' | 'right': the raft side boats tie up at, 'left' = −u, the +x side when facing +z),
 *       seed, and material overrides deck, rim, wall, wallDark, post, roofM, float, bundle.
 * Footprint ≈ (w + 4) × (d + porch + 3) incl. floats; roof overhangs 2 at the sides. Height ≈ wallH + 9.
 * Returns { deck (deck voxel y), door ([x,y,z] standing cell in front of the door), porch ([x,y,z] porch centre, standing
 * level), bench ([x,y,z] person({ pose: 'sit', side: benchSide }) sits on the porch bench), benchSide, mooring ([x, waterY,
 * z] centreline for a longtail alongside, 4 out from the deck edge), mooringDir (bow direction for it), corners ([[x0, z0],
 * [x1, z1]] deck footprint), ridge (y) }.
 */
export function raftHouse(g, p, o = {}) {
  const R = R_(o);
  const F = frame(g, p, o.side ?? '+z', o.mode);
  const w = Math.max(5, o.w ?? 7), d = Math.max(4, o.d ?? 6), wallH = Math.max(5, o.wallH ?? 6);
  const porchD = typeof o.porch === 'number' ? Math.max(0, o.porch) : o.porch === false ? 0 : 6;
  const hu0 = -(w >> 1), hu1 = hu0 + w - 1, uL = hu0 - 1, uR = hu1 + 1;
  const Lr = 1 + d + Math.max(porchD, 1);
  const v0 = -(Lr >> 1), v1 = v0 + Lr - 1, hv0 = v0 + 1, hv1 = hv0 + d - 1;
  const seed = o.seed ?? 1;
  const deckM = o.deck ?? ((u, y, v) => (hash3(v, 7, 3, seed) < 0.12 ? 'plankDark' : hash3(v, 1, 9, seed) < 0.55 ? 'plank' : 'plankLight'));
  const rimM = o.rim ?? 'plankDark', wall = o.wall ?? 'bambooMat', wallDark = o.wallDark ?? 'bambooMatDark', post = o.post ?? 'bambooPoleDark';
  const fl = o.float ?? 'raftFloat';
  const gap = [Math.max(hu0 + 3, hu1 - 3), hu1 - 1];                 // ladder gap in the front railing
  const ladder = porchD > 0 && o.ladder !== false;

  // ---- floats: bamboo bundles along both sides (sticking out 1 past the deck), blue barrels along front + back
  for (const [ua, ub] of [[uL - 1, uL], [uR, uR + 1]]) for (let u = ua; u <= ub; u++) for (let y = -1; y <= 0; y++) for (let v = v0 - 1; v <= v1 + 1; v++) {
    const end = v === v0 - 1 || v === v1 + 1, node = (v - v0 + (u & 1) * 2) % 5 === 0;
    const moss = y === 0 && hash3(u, v, 5, seed) < 0.1;
    F.put(u, y, v, end ? 'bambooMat' : moss ? 'moss' : node ? 'bambooPoleDark' : (o.bundle ?? 'bambooPole'));
  }
  for (const vv of [v0 - 1, v1 + 1]) for (let u = uL + 1; u <= uR - 1; u++) {
    const k = (u - uL - 1) % 3;
    if (k === 2 || (ladder && vv === v1 + 1 && u >= gap[0] && u <= gap[1])) continue;
    F.put(u, 0, vv, fl); F.put(u, -1, vv, o.floatDark ?? 'raftFloatDark');
  }
  for (let u = uL + 1; u <= uR - 1; u++) for (let v = v0; v <= v1; v++) if ((u - uL - 1) % 3 !== 2 && (v - v0) % 4 !== 3) F.put(u, 0, v, (v - v0) % 4 === 1 ? fl : 'raftFloatDark');
  // ---- deck with a darker rim
  for (let u = uL; u <= uR; u++) for (let v = v0; v <= v1; v++) F.put(u, 1, v, u === uL || u === uR || v === v0 || v === v1 ? rimM : deckM);

  // ---- hut walls: woven twill panels between bamboo posts, bamboo sill + top plate
  const y0 = 2, yTop = 1 + wallH, mv = (hv0 + hv1) >> 1;
  for (let y = y0; y <= yTop; y++) for (let u = hu0; u <= hu1; u++) for (let v = hv0; v <= hv1; v++) {
    const eu = u === hu0 || u === hu1, ev = v === hv0 || v === hv1;
    if (!eu && !ev) continue;
    const along = ev ? u : v;
    let m = ((along + y) & 3) < 2 ? wall : wallDark;
    if (y === y0 || y === yTop) m = 'bambooPoleDark';
    if ((eu && ev) || (eu && v === mv && d >= 6)) m = post;
    F.put(u, y, v, m);
  }
  // door (front wall, toward +u) 2 × 5 with a dark frame; front window with shutters swung open + a sill
  const du0 = hu1 - 2, du1 = hu1 - 1;
  for (let u = du0; u <= du1; u++) for (let y = y0; y < y0 + 5; y++) F.set(u, y, hv1, 0);
  F.box(du0 - 1, y0, hv1, du0 - 1, y0 + 4, hv1, 'bambooPoleDark');
  const wu0 = Math.max(hu0 + 1, du0 - 3), wu1 = wu0 + 1;
  for (let u = wu0; u <= wu1; u++) for (let y = y0 + 2; y <= y0 + 3; y++) F.set(u, y, hv1, 0);
  for (const su of [wu0 - 1, wu1 + 1]) F.box(su, y0 + 2, hv1 + 1, su, y0 + 3, hv1 + 1, 'plankDark');
  // side windows with top-hinged shutters propped open; a small back window
  for (const [su, out] of [[hu0, -1], [hu1, 1]]) for (let v = mv - 1; v <= mv; v++) {
    for (let y = y0 + 2; y <= y0 + 3; y++) F.set(su, y, v, 0);
    F.put(su + out, y0 + 4, v, 'plankDark');
  }
  for (let u = -1; u <= 0; u++) for (let y = y0 + 2; y <= y0 + 3; y++) F.set(u, y, hv0, 0);
  // inside: sleeping mat + pillow; a warm lamp tucked in the back corner (lights the interior through the openings)
  F.box(hu0 + 1, y0, hv0 + 1, hu0 + 3, y0, hv0 + 2, 'fabricRed', 'replace');
  F.put(hu0 + 1, y0 + 1, hv0 + 1, 'paper');
  if (o.lit !== false) F.put(hu1 - 1, yTop - 1, hv0 + 1, 'lanternGlow');

  // ---- roof: steep atap thatch (or corrugated tin) over the hut, overhanging 2 at the sides and over the porch front
  const tin = o.roof === 'tin';
  const ru0 = hu0 - 2, ru1 = hu1 + 2, rv0 = hv0 - 1, rv1 = hv1 + (porchD ? 2 : 1), eaveY = wallH;
  const under = tin ? 'tinRoofDark' : 'thatchPalmDark';
  const topM = o.roofM ?? (tin ? (u, y, v) => (hash3(u >> 1, y, v >> 2, seed + 3) < 0.12 ? 'tinRoofRust' : v & 1 ? 'tinRoof' : 'tinRoofDark') : null);
  const ridge = gableRoof(F, ru0, ru1, rv0, rv1, eaveY, {
    slope: o.slope ?? 1.5, thick: 2,
    mat: (u, y, v, i) => (i.e === i.eMax ? under : !topM ? (i.top ? thatchShade(u, y, v, i.e, seed) : 'thatchPalmDark') : !i.top ? under : typeof topM === 'function' ? topM(u, y, v) : topM),
    gable: (u, y) => (((u + y) & 3) < 2 ? wall : wallDark), gableRows: [hv0, hv1], gableFrom: yTop + 1, gableU: [hu0, hu1],
  });
  if (!tin) for (let v = rv0; v <= rv1; v++) for (const u of [ru0, ru1]) if (hash3(u, v, 11, seed) < 0.45) F.put(u, eaveY - 1, v, 'thatchPalmDark'); // ragged fringe
  if (!tin) for (let v = rv0; v <= rv1; v++) F.put(0, ridge + 1, v, (v - rv0) % 3 === 1 ? 'bambooPoleDark' : 'thatchPalmDark');    // ridge roll, tied
  F.put(0, ridge - 2, hv1, 'bambooPoleDark');                          // gable vent

  // ---- porch: railing with a ladder gap, bench under the window, hammock, lantern post, laundry, plants, sandals, towel
  const ret = { deck: p[1] + 1, ridge: p[1] + ridge };
  if (porchD) {
    const pv = v1;
    const rl = { post: o.railPost ?? 'beam' };
    railing(F, run(hv1 + 1, pv, uL, false), y0, rl);
    railing(F, run(hv1 + 1, pv, uR, false), y0, rl);
    railing(F, run(uL, gap[0] - 1, pv, true), y0, rl);
    railing(F, run(gap[1] + 1, uR, pv, true), y0, rl);
    if (ladder) {                                                     // steps down into the water
      for (let u = gap[0]; u <= gap[1]; u++) { F.put(u, 0, pv + 1, 'plank'); F.put(u, -1, pv + 2, 'plankDark'); }
      for (const u of [gap[0] - 1, gap[1] + 1]) F.box(u, -1, pv + 1, u, 0, pv + 1, 'beam');
    }
    // porch posts: hammock post (left), lantern post with an arm (right)
    F.box(hu0, y0, pv, hu0, y0 + 4, pv, 'beam');
    F.box(hu1, y0, pv, hu1, y0 + 5, pv, 'beam');
    F.put(hu1 - 1, y0 + 5, pv, 'beam');
    F.set(hu1 - 1, y0 + 4, pv, o.lit === false ? 'ribbonRed' : 'lanternGlow');
    // bench under the front window (a person sits on it with person(g, bench, { pose: 'sit', side: benchSide }))
    F.box(wu0, y0, hv1 + 1, wu1, y0, hv1 + 1, 'plankDark');
    const bc = F.at(wu0, y0 + 1, hv1 + 1), bc2 = F.at(wu1, y0 + 1, hv1 + 1);
    ret.bench = [Math.min(bc[0], bc2[0]), bc[1], Math.min(bc[2], bc2[2])];
    ret.benchSide = F.side(0, 1);
    // hammock slung between the hut's front-left corner post and the left porch post
    if (o.hammock !== false) {
      const n = pv - hv1 - 1;
      for (let k = 0; k < n; k++) {
        const sag = Math.round(2 * Math.sin((Math.PI * (k + 0.5)) / n)), y = y0 + 3 - sag, edge = k === 0 || k === n - 1;
        const stripe = o.hammockM ?? ['hammock', 'ribbonYellow', 'hammock', 'awningBlue', 'ribbonGreen'][k % 5];
        F.put(hu0, y, hv1 + 1 + k, stripe);
        if (!edge) F.put(hu0 + 1, y, hv1 + 1 + k, stripe);
        if (edge) F.put(hu0, y + 1, hv1 + 1 + k, 'fiberRope');
      }
    }
    // laundry line from the lantern post back to the hut's front-right corner, a sarong + a shirt drying
    if (o.laundry !== false) {
      const ly = y0 + 4;
      for (let v = hv1 + 1; v < pv; v++) F.put(hu1, ly, v, 'fiberRope');
      F.box(hu1, ly - 2, hv1 + 2, hu1, ly - 1, hv1 + 3, R.pick(['awningBlue', 'ribbonGreen', 'fabricRed']));
      F.put(hu1, ly - 1, pv - 1, R.pick(['paper', 'ribbonPink', 'awningYellow']));
    }
    // towel over the right rail, plants, sandals by the door
    const tv = pv - 2;
    F.put(uR, y0 + 2, tv, 'fabric'); F.box(uR + 1, y0 + 1, tv, uR + 1, y0 + 2, tv, 'fabric'); F.put(uR + 1, y0 + 1, tv, 'paper');
    pottedPlant(F, uR - 1, y0, pv - 1, R);
    F.put(du0, y0, hv1 + 2, 'ribbonPink'); F.put(du1, y0, hv1 + 2, 'ribbonPink');
    ret.porch = F.at(0, y0, (hv1 + 1 + pv) >> 1);
  } else ret.porch = F.at(0, y0, hv1 + 1);
  ret.door = F.at(du0, y0, hv1 + 1);

  // ---- mooring post + rope on the boat side; a boat's centreline goes 4 out from the deck edge
  const ms = o.moor === 'right' ? 1 : -1, mu = ms > 0 ? uR : uL, mvv = (v0 + v1) >> 1;
  F.box(mu, y0, mvv + 2, mu, y0 + 1, mvv + 2, 'bambooPoleDark');
  F.put(mu + ms * 2, 1, mvv + 2, 'fiberRope');
  ret.mooring = F.at(mu + ms * 4, 0, mvv);
  ret.mooringDir = F.side(0, 1);
  const c0 = F.at(uL, 0, v0), c1 = F.at(uR, 0, v1);
  ret.corners = [[Math.min(c0[0], c1[0]), Math.min(c0[2], c1[2])], [Math.max(c0[0], c1[0]), Math.max(c0[2], c1[2])]];
  return ret;
}

/**
 * Floating bamboo boardwalk along points [[x, z], …] (connects raft houses). opts: y (deck y = waterY + 1 = a raftHouse's
 * `deck`; default 1), width (3), every (barrel spacing, 5), rail (false | true | 'left' | 'right': bamboo posts + rope on
 * that side of the path direction), seed. Blue barrel floats poke out 1 on both sides at y − 1 (the water's top layer).
 */
export function walkway(g, pts, o = {}) {
  const y = o.y ?? 1, w = o.width ?? 3, hw = w / 2, seed = o.seed ?? 1, every = o.every ?? 5;
  if (pts.length < 2) return g;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const xs = pts.map((q) => q[0]), zs = pts.map((q) => q[1]), m = Math.ceil(hw) + 2;
  const bx0 = Math.floor(Math.min(...xs) - m), bx1 = Math.ceil(Math.max(...xs) + m), bz0 = Math.floor(Math.min(...zs) - m), bz1 = Math.ceil(Math.max(...zs) + m);
  const near = (x, z) => {                                   // distance to the path (chunky metric), along-path s, side
    let best = Infinity, s = 0, side = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), qx = ax + dx * t - x, qz = az + dz * t - z;
      const dd = Math.max(Math.abs(qx), Math.abs(qz)) * 0.5 + Math.hypot(qx, qz) * 0.5;
      if (dd < best) { best = dd; s = cum[i] + t * Math.sqrt(L2); side = Math.sign(dx * (z - az) - dz * (x - ax)); }
    }
    return [best, s, side];
  };
  const railSides = o.rail === true ? [1, -1] : o.rail === 'left' ? [-1] : o.rail === 'right' ? [1] : [];
  for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) {
    const [d, s, side] = near(x, z), k = Math.floor(s + 0.5);
    const float = k % every < 2 && k > 0 && s < cum[cum.length - 1] - 1;
    if (d > hw - 0.01) {                                    // just outside: barrel ends poking out at the waterline
      if (float && d < hw + 0.99) g.put(x, y - 1, z, o.float ?? 'raftFloat', o.mode ?? 'replace');
      continue;
    }
    const edge = d > hw - 1.01;
    const slat = hash3(k, 3, 1, seed) < 0.15 ? 'bambooPoleDark' : k & 1 ? 'bambooPole' : 'bambooMat';
    g.put(x, y, z, edge ? 'bambooPoleDark' : slat, o.mode);
    g.put(x, y - 1, z, float ? (o.float ?? 'raftFloat') : edge ? 'bambooPole' : 'raftFloatDark', o.mode);
    if (edge && railSides.includes(side)) {
      if (k % 4 === 0) g.box([x, y + 1, z], [x, y + 3, z], 'beam', { mode: o.mode });
      else g.put(x, y + 3, z, 'fiberRope', o.mode);
    }
  }
  return g;
}

/**
 * Thai long-tail boat. p = [x, waterY, z] = hull centre on the water surface: the keel sits 1 below it (water inside the
 * hull is cleared), the gunwale 2 above, the bow sweeps up into a ribboned prow ~9 above. Works standalone at
 * p = [0, 0, 0] with no water (an animated prop / creature: keel at y = −1, propeller at y = −2).
 * opts: dir (bow direction '+x' | '-x' | '+z' | '-z', or axis 'x' | 'z'; '+x'), length (16, 12–22), canopy (false | true |
 *       color id), passengers (0–3, 2), driver ('stand' | 'sit' | false), shaft (length behind the stern, ~length/2),
 *       seed, hull, hullDark, paint (gunwale colour).
 * Hull 4 wide (2 at the bow); with the shaft the whole thing is ~length + shaft + 4 long.
 * Returns { bow ([x,y,z] prow tip), stern ([x,y,z] above the transom), prop ([x,y,z] propeller, for a wake), seats
 * ([[x,y,z]…] person p's for pose 'sit'), rope ([x,y,z] bow mooring point), keel (y), length }.
 */
export function longtail(g, p, o = {}) {
  const R = R_(o);
  const dir = o.dir ?? (o.axis === 'z' ? '+z' : '+x');
  const F = frame(g, p, dir, o.mode);
  const L = clamp(Math.round(o.length ?? 16), 12, 22);
  const hull = o.hull ?? 'longtailHull', dark = o.hullDark ?? 'longtailHullDark', paint = o.paint ?? 'longtailPaint';
  const sv = -(L >> 1), bv = sv + L - 1;
  // stations by distance k from the bow: bottom y, rim y, wide (u −2..1) or narrow (u −1..0)
  const ST = [[2, 7], [1, 5], [0, 4], [0, 3], [-1, 3]];
  const ribbons = ['ribbonRed', 'ribbonYellow', 'ribbonPink', 'ribbonGreen'];
  for (let v = sv; v <= bv; v++) {
    const k = bv - v, [b, t] = ST[k] ?? [-1, 2], wide = k >= 3;
    const ua = wide ? -2 : -1, ub = wide ? 1 : 0;
    for (let u = ua; u <= ub; u++) for (let y = b; y <= t; y++) {
      const shell = !wide || u === ua || u === ub || y === b || v === sv;
      if (!shell) { F.set(u, y, v, 0); continue; }          // clear the inside (and any water placed earlier)
      let m = y === b ? dark : y === t ? paint : hull;
      if (k === 0) m = y >= 6 ? ribbons[(y + u + 4) % 4] : hull;
      F.set(u, y, v, m);
    }
  }
  // upswept prow tip leaning forward, wrapped in ribbons, a marigold garland ring
  for (const u of [-1, 0]) { F.set(u, 7, bv + 1, ribbons[(u + 3) % 4]); F.set(u, 8, bv + 1, ribbons[(u + 5) % 4]); F.set(u, 9, bv + 1, 'templeGold'); }
  for (const u of [-2, 1]) F.put(u, 5, bv, 'marigold');
  for (const u of [-1, 0]) F.put(u, 5, bv + 1, 'marigold');
  // floorboards, seats, stern deck
  for (let v = sv + 1; v <= bv - 3; v++) F.box(-1, -1, v, 0, -1, v, 'plankDark', 'replace');
  F.box(-1, 1, sv + 1, 0, 1, sv + 2, 'plank', 'replace');
  const seats = [];
  for (let v = sv + 5; v <= bv - 4; v += 3) { F.box(-1, 1, v, 0, 1, v, 'plankLight', 'replace'); seats.push(v); }
  // automotive engine on a pivot over the stern, long shaft trailing into the water, propeller
  F.box(-1, 3, sv, 0, 3, sv, 'metalDark');
  F.box(-1, 4, sv - 1, 0, 4, sv + 1, 'engineMetal');
  F.box(-1, 5, sv - 1, 0, 5, sv, 'metalDark');
  F.put(0, 5, sv + 1, 'templeRed');                         // air filter
  F.box(1, 4, sv, 1, 6, sv, 'metalDark');                    // exhaust stack
  const sh = o.shaft ?? Math.round(L * 0.5), pv = sv - 2 - sh;
  F.line([-1, 3, sv - 2], [-1, -1, pv], 'engineMetal', 'replace');
  for (const [u, y] of [[-1, -2], [-1, 0], [-2, -1], [0, -1]]) F.set(u, y, pv, 'metalDark');
  // tiller arm reaching forward to the driver's hand
  F.line([1, 5, sv + 1], [1, 4, sv + 3], 'metalDark', 'replace');
  // canopy: an arched awning on four poles over the passengers
  if (o.canopy) {
    const c0 = sv + 4, c1 = Math.min(bv - 4, sv + 4 + Math.max(4, Math.round(L * 0.4)));
    const cm = typeof o.canopy === 'string' ? o.canopy : 'awningBlue';
    for (const u of [-2, 1]) for (const v of [c0, c1]) F.box(u, 3, v, u, 7, v, 'bambooPoleDark');
    for (let v = c0 - 1; v <= c1 + 1; v++) {
      F.box(-1, 9, v, 0, 9, v, cm, 'replace');
      for (const u of [-2, 1]) F.set(u, 8, v, cm);
      if ((v - c0) & 1) for (const u of [-3, 2]) F.set(u, 7, v, 'awningCream');
    }
  }
  // people: passengers facing the bow, the driver at the stern on the tiller
  const ret = { seats: seats.map((v) => { const a = F.at(-1, 2, v), b = F.at(0, 2, v); return [Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2])]; }) };
  const np = clamp(o.passengers ?? 2, 0, seats.length);
  const order = [...seats.keys()].sort((i, j) => Math.abs(i - (seats.length - 1) / 2) - Math.abs(j - (seats.length - 1) / 2));
  for (let i = 0; i < np; i++) F.person(-1, 2, seats[order[i]], 1, { pose: 'sit', seed: R.int(0, 1e6), shirt: R.chance(0.4) ? 'lifeVest' : undefined });
  if (o.driver !== false) F.person(-1, 2, sv + 3, 1, { pose: o.driver === 'sit' ? 'sit' : 'stand', seed: R.int(0, 1e6), hat: R.chance(0.6) ? 'thatchPalmLight' : undefined });
  else F.put(-1, 2, sv + 2, 'templeRed');                  // a fuel can on the empty stern deck
  ret.bow = F.at(0, 9, bv + 1); ret.stern = F.at(0, 3, sv); ret.prop = F.at(-1, -1, pv); ret.rope = F.at(0, 3, bv - 1);
  ret.keel = p[1] - 1; ret.length = L;
  return ret;
}

/**
 * San phra phum — a small ornate Thai spirit house on a white pillar (~5×5 platform, ~12 tall). p = [x, y, z] standing
 * on y (centre). White body with gold columns and a red door, two-tier red roof with green border tiles, gold
 * bargeboards, chofa finials, upturned eave tips and a spire; offerings on its porch (red soda bottles with straws,
 * figurines, marigold garlands) and a little offering table in front (bottles, incense, garland).
 * opts: side ('+z'), pillar (height 2), table (true), seed, base/wall/gold/roof/edge material overrides.
 * Returns { top ([x,y,z] above the spire), table ([x,y,z] standing cell on the table top), platform (y) }.
 */
export function spiritHouse(g, p, o = {}) {
  const R = R_(o);
  const F = frame(g, p, o.side ?? '+z', o.mode);
  const white = o.base ?? 'templeWhite', gold = o.gold ?? 'templeGold', red = o.roof ?? 'templeRed', edge = o.edge ?? 'templeGreen';
  const ph = Math.max(1, o.pillar ?? 2);
  // plinth, slender pillar, capital, platform
  F.box(-1, 0, -1, 1, 0, 1, white);
  F.box(0, 1, 0, 0, ph, 0, white);
  F.box(-1, ph + 1, -1, 1, ph + 1, 1, white);
  const py = ph + 2;
  F.box(-2, py, -2, 2, py, 2, (u, y, v) => (v === 2 ? gold : white));
  // body 3×3 (v -2..0): white walls, gold corner columns, red door under a gold lintel, red side windows
  const hy = py + 1;
  F.box(-1, hy, -2, 1, hy + 2, 0, (u, y, v) => (u !== 0 && v !== -1 ? gold : white));
  F.set(0, hy, 0, o.wall ?? 'templeRed'); F.set(0, hy + 1, 0, o.wall ?? 'templeRed'); F.set(0, hy + 2, 0, gold);
  for (const u of [-1, 1]) F.set(u, hy + 1, -1, o.wall ?? 'templeRed');
  // lower tier (eave hy + 3, overhangs the porch), upper tier (narrower, steeper, stacked on top)
  const ey = hy + 3;
  const t1 = gableRoof(F, -2, 2, -3, 1, ey, {
    slope: 1, thick: 1, mat: (u, y, v, i) => (i.e === 0 ? edge : red),
    gable: (u, y) => (u === 0 && y === ey + 1 ? gold : red), gableRows: [1, -3], gableFrom: ey,
  });
  const t2 = gableRoof(F, -1, 1, -2, 0, t1, { slope: 1.5, thick: 2, mat: () => red });
  // chofa: upswept gold horns at the gable apexes (front ones lean out), a gold spire on the ridge
  F.put(0, t1 + 1, 1, gold); F.put(0, t1 + 1, -3, gold);
  F.put(0, t2 + 1, 0, gold); F.put(0, t2 + 1, -2, gold);
  F.put(0, t2 + 1, -1, gold);
  // offerings on the porch (v 1..2): red soda bottles with straws, a zebra + elephant figurine, garlands under the eaves
  F.put(-2, hy, 2, 'sodaRed'); F.put(-2, hy + 1, 2, 'templeWhite');
  F.put(-1, hy, 2, 'sodaRed'); F.put(-1, hy + 1, 2, 'templeWhite');
  F.put(1, hy, 2, 'templeWhite'); F.put(2, hy, 2, 'stoneLight');
  F.put(2, hy, 1, 'stone');
  for (const u of [-2, 2]) F.put(u, hy + 2, 1, 'marigold');
  const ret = { top: F.at(0, t2 + 2, -1), platform: p[1] + py };
  // offering table on the ground in front: bottles with straws, incense pot + glowing stick, garland over the edge
  if (o.table !== false) {
    const tv = 3;
    F.box(-1, 1, tv, 1, 1, tv, 'plankDark');
    for (const u of [-1, 1]) F.put(u, 0, tv, 'beam');
    F.put(-1, 2, tv, 'sodaRed'); F.put(-1, 3, tv, 'templeWhite');
    F.put(1, 2, tv, 'sodaRed'); F.put(1, 3, tv, 'templeWhite');
    F.put(0, 2, tv, 'thaiClay'); F.put(0, 3, tv, 'incense'); F.put(0, 4, tv, 'incenseTip');
    F.put(0, 1, tv + 1, 'marigold'); F.put(-1, 1, tv + 1, R.chance(0.5) ? 'ribbonRed' : 'marigold'); F.put(1, 1, tv + 1, 'marigold');
    ret.table = F.at(0, 2, tv);
  }
  return ret;
}

/**
 * Jungle tree-house: a chamfered square deck around a trunk at deck height, beams + braces under it, a bamboo railing,
 * a small thatched hut, a spiral stair (or ladder) winding up the trunk, a lantern. c = [x, groundY, z] trunk centre.
 * opts: height (deck height above c.y, 16) or y (absolute deck y), trunkR (radius to build around, 2.5), size (deck
 * half-size, trunkR + 6), side (hut door faces, '+z'), stair ('spiral' | 'ladder' | false), bridges (world sides that get
 * a rail gap + anchor, ['+x', '-z']), tree (true: also draw a simple trunk + canopy), lit (true), seed.
 * Returns { deck (y), bridgeAnchors ([[x,y,z]…] deck-edge cells for ropeBridge, one per `bridges` side), anchors ({ side:
 * [x,y,z] } all four), hut ([x,y,z] hut door), stairBase ([x,y,z]) }.
 */
export function treeHouse(g, c, o = {}) {
  const R = R_(o);
  const side = o.side ?? '+z';
  const deckY = o.y ?? c[1] + (o.height ?? 16), H = deckY - c[1];
  const tr = o.trunkR ?? 2.5, S = Math.round(o.size ?? Math.ceil(tr) + 6);
  const F = frame(g, [c[0], deckY, c[2]], side, o.mode);   // local y = 0 is the deck
  const seed = o.seed ?? 1;
  if (o.tree) {                                            // a simple stand-in tree: flared trunk, two limbs, canopy above the hut
    const bark = o.bark ?? 'bark', top = deckY + 13;
    g.cylinder([c[0], c[1], c[2]], tr + 1.5, 4, bark, { r2: tr });
    g.cylinder([c[0], c[1] + 4, c[2]], tr, top - c[1] - 2, bark, { r2: tr * 0.7 });
    g.line([c[0], top - 3, c[2]], [c[0] - 7, top + 2, c[2] - 3], bark, { r: 1.2, r2: 0.6 });
    g.line([c[0], top - 2, c[2]], [c[0] + 6, top + 3, c[2] - 4], bark, { r: 1.2, r2: 0.6 });
    foliage(g, [{ c: [c[0], top + 6, c[2] - 1], r: 7 }, { c: [c[0] - 7, top + 4, c[2] - 3], r: 5 }, { c: [c[0] + 6, top + 4, c[2] - 4], r: 5 }],
      { leaves: o.leaves ?? ['leafDark', 'leaf', 'leafLight'], seed, mode: 'keep' });
  }
  const inTrunk = (u, v) => Math.hypot(u, v) <= tr + 0.35;
  const chamf = 2, inDeck = (u, v) => Math.abs(u) <= S && Math.abs(v) <= S && Math.abs(u) + Math.abs(v) <= 2 * S - chamf;
  // deck, edge beams under it, radial braces to the trunk
  for (let u = -S; u <= S; u++) for (let v = -S; v <= S; v++) {
    if (!inDeck(u, v) || inTrunk(u, v)) continue;
    const rim = !inDeck(u + 1, v) || !inDeck(u - 1, v) || !inDeck(u, v + 1) || !inDeck(u, v - 1);
    F.put(u, 0, v, rim ? 'plankDark' : hash3(u, 0, 5, seed) < 0.15 ? 'plankLight' : hash3(u, v >> 2, 0, seed) < 0.1 ? 'plankDark' : 'plank');
    if (rim) F.put(u, -1, v, 'beam');
  }
  const r0 = Math.ceil(tr);
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    F.line([a * r0, -6, b * r0], [a * (S - 1), -1, b * (S - 1)], 'beam');
    F.line([a * r0 + b, -6, b * r0 + a], [a * (S - 1) + b, -1, b * (S - 1) + a], 'beam');
    F.box(a * r0 - (b ? 1 : 0), -1, b * r0 - (a ? 1 : 0), a * (S - 1) + (b ? 1 : 0), -1, b * (S - 1) + (a ? 1 : 0), 'beam'); // joists
  }
  // hut on the left (−u) band, door facing +v
  const hu1 = -r0 - 1, hu0 = Math.max(-S + 1, hu1 - 4), hv0 = -3, hv1 = 1, wallH = 5, yTop = wallH;
  for (let y = 1; y <= yTop; y++) for (let u = hu0; u <= hu1; u++) for (let v = hv0; v <= hv1; v++) {
    const eu = u === hu0 || u === hu1, ev = v === hv0 || v === hv1;
    if (!eu && !ev) continue;
    const along = ev ? u : v;
    F.put(u, y, v, eu && ev ? 'bambooPole' : y === 1 || y === yTop ? 'bambooPoleDark' : ((along + y) & 3) < 2 ? 'bambooMat' : 'bambooMatDark');
  }
  const hmid = (hu0 + hu1) >> 1;
  for (let y = 1; y <= 4; y++) F.set(hmid, y, hv1, 0), F.set(hmid + 1, y, hv1, 0);
  for (let y = 2; y <= 3; y++) F.set(hu0, y, hv0 + 2, 0);  // side window
  const hr = gableRoof(F, hu0 - 1, hu1 + 1, hv0 - 1, hv1 + 2, yTop, {
    slope: 1.5, thick: 2, mat: (u, y, v, i) => (i.top ? (i.e === i.eMax ? 'thatchPalmDark' : 'thatchPalm') : 'thatchPalmDark'),
    gable: 'bambooMat', gableRows: [hv0, hv1], gableFrom: yTop + 1, gableU: [hu0, hu1],
  });
  for (let v = hv0 - 1; v <= hv1 + 2; v++) for (const u of [hu0 - 1, hu1 + 1]) if (hash3(u, v, 4, seed) < 0.4) F.put(u, yTop - 1, v, 'thatchPalmDark');
  F.put(hmid, hr + 1, hv1 + 2, 'bambooPoleDark'); F.put(hmid, hr + 1, hv0 - 1, 'bambooPoleDark');
  F.put(hmid - 1, yTop - 1, hv1 + 2, 'bambooPoleDark');
  F.set(hmid - 1, yTop - 2, hv1 + 2, o.lit === false ? 'ribbonRed' : 'lanternGlow');
  // rope pulley on the front edge: a post, an arm over the rail, a rope down to a basket
  if (o.pulley !== false) {
    const pu = Math.min(S - 3, r0 + 2), pv = S - 1;
    F.box(pu, 1, pv, pu, 5, pv, 'beam'); F.box(pu, 5, pv + 1, pu, 5, pv + 2, 'beam');
    const drop = Math.min(H - 3, 8);
    for (let y = 4; y > -drop; y--) F.put(pu, y, pv + 2, 'fiberRope');
    F.box(pu, -drop - 1, pv + 2, pu + 1, -drop, pv + 3, 'bambooMatDark');
    F.put(pu + 1, -drop + 1, pv + 3, 'marigold');            // fruit in the basket
  }
  // railing around the rim, with gaps for bridges and the stair hatch
  const gaps = (o.bridges ?? ['+x', '-z']).map((s) => s);
  const anchors = {}, bridgeAnchors = [];
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const sd = F.side(a, b), q = F.at(a * S, 0, b * S);
    anchors[sd] = q;
    if (gaps.includes(sd)) bridgeAnchors.push(q);
  }
  const gapAt = (u, v) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => gaps.includes(F.side(a, b)) && (a ? u === a * S && Math.abs(v) <= 1 : v === b * S && Math.abs(u) <= 1));
  const rim = [];
  for (let u = -S; u <= S; u++) for (let v = -S; v <= S; v++) if (inDeck(u, v) && (!inDeck(u + 1, v) || !inDeck(u - 1, v) || !inDeck(u, v + 1) || !inDeck(u, v - 1))) rim.push([u, v]);
  for (const [u, v] of rim) {
    if (gapAt(u, v)) continue;
    if (u >= hu0 - 1 && u <= hu1 + 1 && v >= hv0 - 1 && v <= hv1 + 1) continue;
    const postHere = (u + v) % 3 === 0 || (Math.abs(u) === S && Math.abs(v) === S - chamf) || (Math.abs(v) === S && Math.abs(u) === S - chamf);
    if (postHere) F.box(u, 1, v, u, 2, v, 'beam');
    else F.put(u, 2, v, 'bambooPole');
  }
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (gaps.includes(F.side(a, b))) for (const s of [-2, 2]) F.box(a ? a * S : s, 1, b ? b * S : s, a ? a * S : s, 4, b ? b * S : s, 'beam');
  // spiral stair around the trunk (treads 2 deep, rope rail), arriving through a hatch on the front-left of the deck
  const ret = { deck: deckY, bridgeAnchors, anchors, hut: F.at(hmid, 1, hv1 + 1) };
  if (o.stair !== false && o.stair !== 'ladder') {
    const ri = tr + 0.6, ro = tr + 3.4, run = 1.7, rm = (ri + ro) / 2, dth = run / rm;
    const thEnd = Math.atan2(1, -0.25), th0 = thEnd - H * dth;   // local angle: u = cos, v = sin
    const ext = Math.ceil(ro + 1);
    for (let u = -ext; u <= ext; u++) for (let v = -ext; v <= ext; v++) {
      const r = Math.hypot(u, v);
      if (r < tr + 0.5 || r > ro + 1.2) continue;
      const a = Math.atan2(v, u);
      for (let n = -4; n <= 4; n++) {
        const k = Math.floor((a + 2 * Math.PI * n - th0) / dth);
        if (k < 0 || k > H) continue;
        const y = k - H;                                    // local: deck is 0, the ground standing level is -H
        if (r <= ro) {
          F.put(u, y, v, r > ro - 0.8 ? 'bambooPoleDark' : 'bambooPole');
          if (r < ri + 0.5) F.put(u, y - 1, v, 'beam', 'keep');
          for (let h = 1; h <= 7 && y + h <= 0; h++) if (y + h > -6) F.set(u, y + h, v, 0); // headroom: a hatch in the deck
        } else if (r > ro + 0.3) {
          if (k % 3 === 0) F.box(u, y + 1, v, u, y + 3, v, 'beam', 'keep');
          else F.put(u, y + 3, v, 'fiberRope', 'keep');
        }
      }
    }
    ret.stairBase = F.at(Math.round(Math.cos(th0) * rm), -H + 1, Math.round(Math.sin(th0) * rm));
  } else if (o.stair === 'ladder') {
    const lv = r0 + 1;
    for (let y = -H + 1; y <= 2; y++) { F.put(-1, y, lv, 'bambooPoleDark'); F.put(1, y, lv, 'bambooPoleDark'); if (y % 2 === 0 && y <= 0) F.put(0, y, lv, 'bambooPole'); }
    for (let u = -1; u <= 1; u++) F.set(u, 0, lv, u ? 'bambooPoleDark' : 0);
    ret.stairBase = F.at(0, -H + 1, lv + 1);
  }
  return ret;
}

/**
 * Sagging rope suspension bridge of planks from a to b (deck points [x, y, z], any direction). opts: width (plank width,
 * 3), sag (len / 12), railH (handrope height above the deck, 3), every (hanger spacing, 3), gaps (chance of a missing
 * plank, 0.05), posts (true: end posts), plank/rope/post materials, seed. Returns { mid: [x,y,z] lowest deck point }.
 */
export function ropeBridge(g, a, b, o = {}) {
  const seed = o.seed ?? 1;
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1;
  const w = o.width ?? 3, hw = (w - 1) / 2, sag = o.sag ?? Math.max(1, Math.round(len / 12)), railH = o.railH ?? 3, every = o.every ?? 3;
  const ux = dx / len, uz = dz / len, px = -uz, pz = ux;
  const rope = o.rope ?? 'fiberRope';
  const yAt = (t) => a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t);
  const N = Math.ceil(len * 3);
  let low = null;
  for (let i = 0; i <= N; i++) {
    const t = i / N, cx = a[0] + 0.5 + dx * t, cz = a[2] + 0.5 + dz * t, y = Math.round(yAt(t)), k = Math.floor(t * len + 0.5);
    const missing = k > 1 && k < len - 1 && hash3(k, 5, 2, seed) < (o.gaps ?? 0.05);
    const pm = hash3(k, 1, 7, seed) < 0.2 ? 'plank' : k & 1 ? 'plankLight' : 'bambooPole';
    for (let s = -hw; s <= hw + 1e-6; s += 0.5) if (!missing) g.put(Math.floor(cx + px * s), y, Math.floor(cz + pz * s), o.plank ?? pm, o.mode);
    for (const sd of [-1, 1]) {
      const s = sd * (hw + 1), x = Math.floor(cx + px * s), z = Math.floor(cz + pz * s);
      g.put(x, Math.round(yAt(t) + railH), z, rope, o.mode);
      if (k % every === 0 && Math.abs(t * len - k) < 0.2) for (let h = 0; h < railH; h++) g.put(x, y + h, z, rope, o.mode);
    }
    if (!low || y < low[1]) low = [Math.floor(cx), y, Math.floor(cz)];
  }
  if (o.posts !== false) for (const [q, t] of [[a, 0], [b, 1]]) for (const sd of [-1, 1]) {
    const s = sd * (hw + 1), x = Math.floor(q[0] + 0.5 + px * s), z = Math.floor(q[2] + 0.5 + pz * s);
    g.box([x, q[1], z], [x, q[1] + railH + 1, z], o.post ?? 'bambooPoleDark', { mode: o.mode });
  }
  return { mid: low };
}

/**
 * Small sit-in kayak (2 wide, 12 / 15 long) with paddlers. p = [x, waterY, z] = hull centre on the water surface (the
 * hull sits in the water's top layer, the deck 1 above). opts: dir ('+x' bow direction), seats (1 | 2), people (default
 * seats; 0 = empty, dark cockpits), color ('kayakOrange' | 'kayakYellow' | id; random per seed), paddle (true), seed.
 * Returns { bow, stern ([x,y,z] tips), seats ([[x,y,z]…] person p's for pose 'sit') }.
 */
export function kayak(g, p, o = {}) {
  const R = R_(o);
  const F = frame(g, p, o.dir ?? (o.axis === 'z' ? '+z' : '+x'), o.mode);
  const two = (o.seats ?? 1) >= 2, L = two ? 15 : 12, sv = -(L >> 1), bv = sv + L - 1;
  const col = o.color ?? R.pick(['kayakOrange', 'kayakYellow']);
  const vest = col === 'kayakYellow' ? 'lifeVest' : 'awningBlue';
  for (let v = sv; v <= bv; v++) for (const u of [-1, 0]) {
    const tip = v === sv || v === bv;
    if (!tip) F.set(u, 0, v, col);
    F.set(u, 1, v, tip ? 0 : col);
    if (tip) F.set(u, 1, v, col);
  }
  for (const v of [sv, bv]) for (const u of [-1, 0]) F.set(u, 2, v, col);   // upturned bow + stern
  const cockpits = two ? [sv + 4, sv + 9] : [sv + 5];
  const n = clamp(o.people ?? cockpits.length, 0, cockpits.length);
  const ret = { bow: F.at(0, 2, bv), stern: F.at(0, 2, sv), seats: [] };
  cockpits.forEach((cv, i) => {
    const a = F.at(-1, 1, cv), b = F.at(0, 1, cv);
    ret.seats.push([Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2])]);
    for (const u of [-1, 0]) F.set(u, 1, cv + 2, 'metalDark');   // spray-deck rim in front of the paddler
    if (i < n) {
      F.person(-1, 1, cv, 1, { pose: 'sit', seed: R.int(0, 1e6), shirt: vest });
      if (o.paddle !== false) {                                 // paddle held at the hands, blades feathered
        const up = (i + (o.seed ?? 1)) & 1 ? 1 : -1;
        F.line([-5, 2 - up, cv], [4, 2 + up, cv], 'plankDark', 'keep');
        F.set(-6, 2 - up, cv, 'metalDark'); F.set(5, 2 + up, cv, 'metalDark');
        F.set(-6, 1 - up, cv, 'metalDark'); F.set(5, 3 + up, cv, 'metalDark');
      }
    } else for (const u of [-1, 0]) F.set(u, 1, cv, 'metalDark'), F.set(u, 1, cv + 1, 'metalDark');
  });
  return ret;
}

/**
 * Sala — small open Thai pavilion: white posts on a raised plinth (or stilts over water), benches between the posts,
 * steep two-tier red roof with green border tiles, gold bargeboards, chofa finials and upturned eave tips.
 * p = [x, y, z] floor centre standing on y. opts: side ('+z'), w (7), d (9), postH (6), raise (plinth height 2),
 * stilts (0: if > 0 the floor stands on wooden piles that many voxels high — over water), steps (true), seed.
 * Returns { floor (y), ridge (y), front ([x,y,z] cell in front of the steps) }.
 */
export function sala(g, p, o = {}) {
  const F = frame(g, p, o.side ?? '+z', o.mode);
  const w = o.w ?? 7, d = o.d ?? 9, ph = o.postH ?? 6, raise = o.stilts ? o.stilts : Math.max(1, o.raise ?? 2);
  const u0 = -(w >> 1), u1 = u0 + w - 1, v0 = -(d >> 1), v1 = v0 + d - 1;
  const white = o.base ?? 'templeWhite', gold = o.gold ?? 'templeGold', red = o.roof ?? 'templeRed', green = o.edge ?? 'templeGreen';
  const fy = raise - 1;                                    // floor voxel row (local)
  if (o.stilts) {
    for (const u of [u0, u1, 0]) for (let v = v0; v <= v1; v += 2) if (u !== 0 || v === v0 || v === v1) {
      F.box(u, 0, v, u, fy - 1, v, 'beam');
      for (let y = -1; y > -14; y--) { const id = F.get(u, y, v); if (id && !isWet(g, id)) break; F.set(u, y, v, 'beam'); } // piles down to the bed
    }
    F.box(u0, fy, v0, u1, fy, v1, (u, y, v) => (u === u0 || u === u1 || v === v0 || v === v1 ? 'plankDark' : (v & 1 ? 'plank' : 'plankLight')));
  } else {
    F.box(u0, 0, v0, u1, fy, v1, (u, y, v) => (y === fy ? (u === u0 || u === u1 || v === v0 || v === v1 ? white : (u & 1 ? 'plankLight' : 'plank')) : y === 0 ? 'stoneLight' : white));
  }
  if (o.steps !== false) for (let k = 0; k < raise; k++) F.box(-1, k, v1 + raise - k, 1, k, v1 + raise - k, o.stilts ? 'plank' : white);
  // posts with red capitals; benches between the side/back posts
  const posts = [];
  for (const u of [u0, u1]) for (let v = v0; v <= v1; v += Math.max(2, Math.floor((d - 1) / 2))) posts.push([u, v]);
  for (const u of [u0, u1]) posts.push([u, v1]);
  for (const [u, v] of posts) { F.box(u, fy + 1, v, u, fy + ph - 1, v, white); F.put(u, fy + ph, v, red); }
  for (let v = v0; v <= v1; v++) for (const u of [u0, u1]) F.put(u, fy + 1, v, 'plankDark', 'keep');
  for (let u = u0; u <= u1; u++) F.put(u, fy + 1, v0, 'plankDark', 'keep');
  // beams on top of the posts
  const by = fy + ph + 1;
  F.box(u0, by, v0, u1, by, v1, (u, y, v) => (u === u0 || u === u1 || v === v0 || v === v1 ? 'templeRed' : 0));
  // roof: lower tier over everything, upper tier stepped back + up (classic layered gables)
  const roofMat = (u, y, v, i) => (i.end ? gold : i.e === 0 ? green : i.e === 1 && i.top ? green : red);
  const t1 = gableRoof(F, u0 - 2, u1 + 2, v0 - 1, v1 + 1, by, { slope: 1.5, thick: 2, mat: roofMat, gable: (u, y) => (u === 0 && (y & 1) ? gold : red), gableRows: [v0 - 1, v1 + 1], gableFrom: by + 1, gableU: [u0, u1] });
  const t2 = gableRoof(F, u0 - 1, u1 + 1, v0 + 1, v1 - 1, by + 3, { slope: 1.5, thick: 2, mat: (u, y, v, i) => (i.end ? gold : i.e === 0 ? green : red) });
  // chofa finials + upturned eave tips
  for (const [v, s] of [[v1 + 1, 1], [v0 - 1, -1]]) { F.put(0, t1 + 1, v, gold); F.put(0, t1 + 2, v + s, gold); F.put(0, t1 + 3, v + s, gold); for (const u of [u0 - 2, u1 + 2]) F.put(u, by + 1, v + s, gold); }
  for (const [v, s] of [[v1 - 1, 1], [v0 + 1, -1]]) { F.put(0, t2 + 1, v, gold); F.put(0, t2 + 2, v + s, gold); }
  return { floor: p[1] + fy, ridge: p[1] + t2, front: F.at(0, 0, v1 + raise + 1) };
}

/**
 * National-park entrance sign: a carved plank board with raised yellow letters on two log posts, under a little thatch
 * roof, with a flower planter. p = [x, y, z] centre standing on y. opts: text ('KHAO SOK'; '\n' for 2 lines), side ('+z'),
 * ink ('ribbonYellow'), raised (false: letters inlaid flush; true: raised 1), board (dark planks), post ('bark'), roof ('thatchPalm' |
 * false), lift (board bottom above ground, 3). Board is text-width + 4 wide (4 per letter): 'KHAO SOK' ≈ 37 wide incl. posts,
 * 'KHAO\nSOK' ≈ 21. Returns { top }.
 */
export function parkSign(g, p, o = {}) {
  const F = frame(g, p, o.side ?? '+z', o.mode);
  const lines = String(o.text ?? 'KHAO SOK').toUpperCase().split('\n');
  const tw = Math.max(...lines.map((l) => l.length * 4 - 1)), bw = tw + 4, bh = lines.length * 6 + 3, lift = o.lift ?? 3;
  const ua = -(bw >> 1), ub = ua + bw - 1, yb = lift, yt = lift + bh - 1;
  for (const u of [ua - 1, ub + 1]) for (let y = 0; y <= yt + 1; y++) F.put(u, y, 0, y % 4 === 3 ? 'barkDark' : (o.post ?? 'bark'));
  F.box(ua, yb, 0, ub, yt, 0, (u, y) => (y === yb || y === yt || u === ua || u === ub ? 'beam' : (o.board ?? (y % 3 ? 'plankDark' : 'beam'))));
  F.box(ua, yb, -1, ub, yt, -1, 'plankDark');
  lines.forEach((line, i) => {
    // a reader facing the sign has local +u on their LEFT, so text runs toward -u from the board's +u edge
    const lw = line.length * 4 - 1, su = ub - 2 - ((tw - lw) >> 1), top = yt - 2 - i * 6;
    let col = 0;
    for (const ch of line) {
      const glyph = GLYPHS[ch] ?? GLYPHS['?'];
      for (let r = 0; r < 5; r++) for (let c2 = 0; c2 < 3; c2++) if (glyph[r * 3 + c2] === '1') F.put(su - col - c2, top - r, o.raised ? 1 : 0, o.ink ?? 'ribbonYellow');
      col += 4;
    }
  });
  if (o.roof !== false) {
    const rm = o.roof ?? 'thatchPalm';
    for (let u = ua - 2; u <= ub + 2; u++) {
      F.put(u, yt + 3, -1, 'thatchPalmDark'); F.put(u, yt + 3, 0, 'thatchPalmDark');
      F.put(u, yt + 2, -2, rm); F.put(u, yt + 2, 1, rm); F.put(u, yt + 1, -3, rm); F.put(u, yt + 1, 2, rm);
    }
  }
  // planter with marigolds and red flowers at the foot
  F.box(ua + 1, 0, 1, ub - 1, 0, 2, (u, y, v) => (v === 2 || u === ua + 1 || u === ub - 1 ? 'stoneLight' : 'dirt'));
  for (let u = ua + 2; u <= ub - 2; u++) F.put(u, 1, 1, (u & 1) ? 'marigold' : (u % 3 ? 'leaf' : 'petalRed'));
  return { top: F.at(0, yt + 4, 0) };
}
// the 3×5 font used by g.text (shapes.js), restated for frame-rotated signs
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', ' ': '000000000000000', '.': '000000000000010', '!': '010010010000010', '-': '000000111000000',
  "'": '010010000000000', '?': '110001010000010',
};

/**
 * Wooden jetty from the shore end a to the far end b ([x, deckY, z]; runs along the longer of x / z), on piles driven
 * down to the first solid non-water voxel (or `bottom`). opts: width (3), every (pile spacing, 3), bottom (deck y − 8),
 * lamp (true: lantern post at the end), ladder (true), bollards (true), seed. Returns { end: [x,y,z] standing cell at the end }.
 */
export function jetty(g, a, b, o = {}) {
  const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[2] - a[2]);
  const n = Math.abs(alongX ? b[0] - a[0] : b[2] - a[2]), s = Math.sign(alongX ? b[0] - a[0] : b[2] - a[2]) || 1;
  const dir = alongX ? (s > 0 ? '+x' : '-x') : s > 0 ? '+z' : '-z';
  const F = frame(g, a, dir, o.mode);
  const w = o.width ?? 3, ua = -(w >> 1), ub = ua + w - 1, every = o.every ?? 3, seed = o.seed ?? 1;
  const bottom = (o.bottom ?? a[1] - 8) - a[1];
  for (let v = 0; v <= n; v++) for (let u = ua; u <= ub; u++) F.put(u, 0, v, hash3(v, u, 3, seed) < 0.1 ? 'plankDark' : v & 1 ? 'plank' : 'plankLight');
  for (let v = 0; v <= n; v += every) for (const u of [ua - 1, ub + 1]) {
    let y = -1;
    while (y > bottom) { const id = F.get(u, y, v); if (id && !isWet(g, id)) break; F.set(u, y, v, 'beam'); y--; }
    F.put(u, 0, v, 'beam'); if (o.bollards !== false && (v === n - (n % every) || v === 0)) F.put(u, 1, v, 'beam');
    if (v + every <= n) F.line([u, -1, v], [u, -1, v + every], 'beam');
  }
  if (o.ladder !== false) for (let y = -3; y <= 0; y++) { F.put(ub + 1, y, n - 1, 'bambooPoleDark'); F.put(ub + 1, y, n + 1, 'bambooPoleDark'); if (y & 1) F.put(ub + 1, y, n, 'bambooPole'); }
  if (o.lamp !== false) { F.box(ua - 1, 1, n, ua - 1, 6, n, 'beam'); F.put(ua, 6, n, 'beam'); F.put(ua, 5, n, 'bambooPoleDark'); F.set(ua, 4, n, 'lanternGlow'); }
  return { end: F.at(0, 1, n) };
}

// ---- registration (every exported generator needs one; test.mjs checks) ----
const T_ = (fn, summary, example, meta = {}) => defineGenerator(fn, { category: 'thai', summary, example, ...meta });
/** example helper: a flat lake patch (sand bed, water top at y = wy) */
const lake = (g, x0, z0, x1, z1, wy = 0, depth = 3) => { g.box([x0, wy - depth, z0], [x1, wy - depth, z1], 'sand'); g.box([x0, wy - depth + 1, z0], [x1, wy, z1], 'water'); };
T_(raftHouse, 'floating bamboo raft bungalow (Cheow Lan): floats, atap roof, porch, hammock, lantern', (g) => { lake(g, -11, -11, 11, 11); raftHouse(g, [0, 0, -1], { seed: 3 }); }, { ground: false });
T_(walkway, 'floating bamboo boardwalk on blue barrels (connects raft houses)', (g) => { lake(g, -11, -11, 11, 11); walkway(g, [[-9, -6], [2, -6], [2, 8], [9, 8]], { y: 1 }); }, { ground: false });
T_(longtail, 'Thai long-tail boat: ribboned prow, car engine on a long shaft, passengers', (g) => { lake(g, -11, -11, 11, 11); longtail(g, [3, 0, -3], { seed: 3 }); longtail(g, [-2, 0, 6], { seed: 5, length: 14, canopy: true, passengers: 1, dir: '-x' }); }, { ground: false });
T_(spiritHouse, 'san phra phum spirit house: gilded tiered roof, offerings, red soda bottles', (g) => spiritHouse(g, [0, 1, -1], { seed: 3 }));
T_(treeHouse, 'jungle tree-house: deck around a trunk, thatched hut, spiral stair, pulley basket, bridge anchors', (g) => treeHouse(g, [0, 1, 0], { height: 13, trunkR: 2, size: 8, tree: true, seed: 3 }));
T_(ropeBridge, 'sagging rope suspension bridge of planks between two points', (g) => { for (const x of [-10, 10]) g.box([x - 1, 1, -2], [x + 1, 8, 2], 'bark'); ropeBridge(g, [-9, 8, 0], [9, 8, 0], { sag: 3 }); });
T_(kayak, 'kayak with paddlers (1–2 seats)', (g) => { lake(g, -11, -11, 11, 11); kayak(g, [-1, 0, -5], { seed: 2 }); kayak(g, [1, 0, 5], { seats: 2, seed: 4, dir: '-x' }); }, { ground: false });
T_(sala, 'open Thai pavilion (sala): white posts, two-tier red/green roof, gold finials', (g) => sala(g, [0, 1, -1], { seed: 3 }));
T_(parkSign, 'national park entrance sign (carved letters, log posts, thatch hood)', (g) => parkSign(g, [0, 1, 0], { text: 'KHAO\nSOK' }));
T_(jetty, 'wooden jetty on piles with ladder, bollards and a lantern', (g) => { lake(g, -11, -11, 11, 2); g.box([-11, -3, 3], [11, 0, 11], 'grass'); jetty(g, [0, 1, 4], [0, 1, -9]); }, { ground: false });

// ---- boats as actors: cruise a loop on the lake (stage.actors({ creature: 'longtailBoat', on: 'water', behavior: 'path', path })) ----
// One-part rigs at world scale (scale 1): the boat model from longtail()/kayak() at the origin, facing +z.
const boatPalette = () => new Palette({ ...NATURE, ...BUILD, ...THAI });
/** Long-tail boat actor. opts: as longtail() (length, canopy, passengers, driver, seed), lift (−1: keel under the surface), speed. */
function longtailBoat(o = {}) {
  const P = boatPalette(), g = new VoxelGrid(P);
  const { lift, speed, scale, ...lo } = o;
  longtail(g, [0, 0, 0], { passengers: 2, ...lo, dir: '+z', seed: o.seed ?? 1 });
  return rig([{ name: 'boat', role: 'body', grid: g }], { palette: P, swim: true, lift: lift ?? -1, scale: scale ?? 1, speed: speed ?? [3.2, 4.4], stride: 12, idle: [0, 0], anim: { bob: 0 } });
}
/** Kayak actor (1–2 paddlers). opts: as kayak() (seats, color, seed), lift, speed. */
function kayakBoat(o = {}) {
  const P = boatPalette(), g = new VoxelGrid(P);
  const { lift, speed, scale, ...ko } = o;
  kayak(g, [0, 0, 0], { ...ko, dir: '+z', seed: o.seed ?? 1 });
  return rig([{ name: 'kayak', role: 'body', grid: g }], { palette: P, swim: true, lift: lift ?? -1, scale: scale ?? 1, speed: speed ?? [1.2, 1.8], stride: 8, idle: [0, 0], anim: { bob: 0 } });
}
const boatExample = (name) => (stage, { center }) => {
  const [x, , z] = center;
  stage.actors({ creature: name, on: 'water', behavior: 'path', path: [[x - 6, z - 6], [x + 6, z - 6], [x + 6, z + 6], [x - 6, z + 6]], count: 1 });
};
defineCreature('longtailBoat', longtailBoat, { summary: 'long-tail boat cruising a path on water (on: water, behavior: path)', habitat: 'water', example: boatExample('longtailBoat') });
defineCreature('kayakBoat', kayakBoat, { summary: 'kayak with paddlers on a path on water', habitat: 'water', example: boatExample('kayakBoat') });
