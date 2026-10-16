// Rainforest understory and water plants: ferns, tree ferns, giant alocasia leaves, rafflesia, heliconia,
// rattan, lianas, epiphytes/orchids, lotus and lily pads, pitcher plants, mossy fallen logs with fungi.
// Same conventions as nature.js: fn(g, p, o), p = base position standing on y, `seed`/`R`, overrides.
//
//   const P = new Palette({ ...NATURE, ...UNDERSTORY });
//   fern(g, [x, 1, z], { seed: 3 });  alocasia(g, p);  rafflesia(g, p, { buds: 2 });  fallenLog(g, a, b);
//   lianas(g, branchTips, { seed: 4 });  epiphytes(g, { area: [[x0, y0, z0], [x1, y1, z1]], on: ['bark'] });
//   lilyPads(g, [x0, z0], [x1, z1], { y: waterY });  undergrowth(g, [x0, z0], [x1, z1], { on: ['grass'] });
//
// Defaults only use UNDERSTORY material names, so `{ ...UNDERSTORY }` alone is enough for every generator.
import { rng, noise, hash3, clamp } from '../random.js';
import { spline } from '../shapes.js';
import { defineGenerator } from '../registry.js';

/** Default materials for the understory generators. Spread into your palette and override freely. */
export const UNDERSTORY = {
  fern: { color: '#3a7a2e', jitter: 0.05, sway: 0.5 },
  fernLight: { color: '#5e9e38', jitter: 0.05, sway: 0.55 },
  fernDark: { color: '#25552a', jitter: 0.05, sway: 0.45 },
  treeFernTrunk: { color: '#3b2c22', jitter: 0.06, noise: { color: '#2c2019', scale: 0.5, amount: 0.6 } },
  treeFernTrunkLight: { color: '#6a5038', jitter: 0.05 },          // old frond-base scars
  alocasia: { color: '#24683a', jitter: 0.04, sway: 0.35 },
  alocasiaLight: { color: '#3f8a44', jitter: 0.04, sway: 0.35 },
  alocasiaVein: { color: '#a6cf7a', jitter: 0.03, sway: 0.35 },
  alocasiaStem: { color: '#6f9c50', jitter: 0.04, sway: 0.3 },
  rafflesia: { color: '#c23a28', jitter: 0.05 },
  rafflesiaDark: { color: '#781a18', jitter: 0.05 },
  rafflesiaSpot: { color: '#f2dcc4', jitter: 0.04 },
  rafflesiaCore: { color: '#2a0c0a', jitter: 0.04 },
  rafflesiaRim: { color: '#e06a48', jitter: 0.04 },                  // paler lip of the central cup + petal tips
  rafflesiaBud: { color: '#6b4632', jitter: 0.05 },
  rafflesiaBudDark: { color: '#45291c', jitter: 0.05 },
  heliconia: { color: '#e83a2a', jitter: 0.04 },
  heliconiaTip: { color: '#f0d040', jitter: 0.04 },
  heliconiaLeaf: { color: '#4b9440', jitter: 0.05, sway: 0.45 },
  heliconiaLeafDark: { color: '#2f6e32', jitter: 0.05, sway: 0.4 },
  rattanStem: { color: '#7a7a44', jitter: 0.04 },
  rattanStemDark: { color: '#4a4628', jitter: 0.04 },
  rattanLeaf: { color: '#4e8a38', jitter: 0.05, sway: 0.55 },
  rattanLeafLight: { color: '#7aa84a', jitter: 0.05, sway: 0.6 },
  liana: { color: '#5e5434', jitter: 0.05 },
  lianaDark: { color: '#3a3220', jitter: 0.05 },
  lianaLeaf: { color: '#3f7a34', jitter: 0.05, sway: 0.45 },
  orchid: { color: '#e070c0', jitter: 0.04, sway: 0.4 },
  orchidWhite: { color: '#f4eef4', jitter: 0.03, sway: 0.4 },
  bromeliad: { color: '#d8343e', jitter: 0.04 },
  bromeliadLeaf: { color: '#5f9440', jitter: 0.05, sway: 0.2 },
  lilyPad: { color: '#4a8a3a', jitter: 0.05 },
  lilyPadDark: { color: '#33692e', jitter: 0.05 },
  lilyPadLight: { color: '#73a84a', jitter: 0.05 },
  lotus: { color: '#f08cb4', jitter: 0.04 },
  lotusLight: { color: '#fcd6e4', jitter: 0.03 },
  lotusCenter: { color: '#f0d050', jitter: 0.03 },
  pitcher: { color: '#9a3030', jitter: 0.05 },
  pitcherGreen: { color: '#7aa040', jitter: 0.05 },
  pitcherRim: { color: '#d04838', jitter: 0.04 },
  pitcherInside: { color: '#2a1210', jitter: 0.03 },
  pitcherLeaf: { color: '#3e6e2c', jitter: 0.05, sway: 0.3 },
  mossDeep: { color: '#3a6a2a', jitter: 0.06 },
  fungus: { color: '#e8d8b0', jitter: 0.04 },
  fungusOrange: { color: '#e88a3a', jitter: 0.04 },
  log: { color: '#5a4030', jitter: 0.06, noise: { color: '#43301f', scale: 0.4, amount: 0.6 } },
  logDark: { color: '#3c2a1c', jitter: 0.05 },
  logCut: { color: '#b48c5e', jitter: 0.04 },
  logCutDark: { color: '#8a6640', jitter: 0.04 },
  logInside: { color: '#2a1c14', jitter: 0.04 },
  logMoss: { color: '#4f7f2e', jitter: 0.07, noise: { color: '#3e6a26', scale: 0.3, amount: 0.6 } },
  logMossLight: { color: '#7fa646', jitter: 0.06 },
};

// ---- helpers ----------------------------------------------------------------------------------------
const TAU = Math.PI * 2;
const list = (m) => (Array.isArray(m) ? m : [m]);
const R_ = (o) => o.R ?? rng(o.seed ?? 1);
const mats = (g, m) => list(m).map((x) => g.mat(x));
const shadeOf = (shades, t) => shades[clamp(Math.floor(t * shades.length), 0, shades.length - 1)];
const rnd = Math.round;
const range = (v, R, lo, hi) => (Array.isArray(v) ? R.range(v[0], v[1]) : v ?? R.range(lo, hi));

/** Visit a face-connected (6-connected) voxel path through float points: visit(x, y, z, i). Ropes, stems. */
function walk6(pts, visit) {
  let cx = rnd(pts[0][0]), cy = rnd(pts[0][1]), cz = rnd(pts[0][2]), i = 0;
  visit(cx, cy, cz, i++);
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])) * 2));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      const tx = rnd(a[0] + (b[0] - a[0]) * t), ty = rnd(a[1] + (b[1] - a[1]) * t), tz = rnd(a[2] + (b[2] - a[2]) * t);
      while (cx !== tx || cy !== ty || cz !== tz) {
        const dx = tx - cx, dy = ty - cy, dz = tz - cz, ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
        if (ay >= ax && ay >= az) cy += Math.sign(dy);
        else if (ax >= az) cx += Math.sign(dx);
        else cz += Math.sign(dz);
        visit(cx, cy, cz, i++);
      }
    }
  }
  return i;
}

/** Visit a thin (edge-connected, no corner-only steps) voxel path through float points: visit(x, y, z, i). Ropes, stems. */
function trace(pts, visit) {
  let lx = null, ly = 0, lz = 0, i = 0;
  const emit = (x, y, z) => {
    if (lx !== null) {
      if (x === lx && y === ly && z === lz) return;
      if (x !== lx && y !== ly && z !== lz) { visit(lx, y, lz, i++); }      // bridge a corner-only step
    }
    visit(x, y, z, i++); lx = x; ly = y; lz = z;
  };
  emit(rnd(pts[0][0]), rnd(pts[0][1]), rnd(pts[0][2]));
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])) * 2));
    for (let s = 1; s <= n; s++) { const t = s / n; emit(rnd(a[0] + (b[0] - a[0]) * t), rnd(a[1] + (b[1] - a[1]) * t), rnd(a[2] + (b[2] - a[2]) * t)); }
  }
  return i;
}

const isFoliage = (g, id) => id && (g.palette?.defs[id]?.sway ?? 0) > 0;
const isWater = (g, id) => id && g.palette?.defs[id]?.src?.kind === 'water';

/** Ground under (x, z) at or below y0: highest solid that is not foliage (or is in `on`) with air above. */
function groundBelow(g, x, z, y0, on, minY = -64) {
  for (let y = y0; y >= minY; y--) {
    const id = g.get(x, y, z);
    if (!id || g.get(x, y + 1, z) || isWater(g, id)) continue;
    if (on ? on.has(id) : !isFoliage(g, id)) return y;
  }
  return null;
}

// ---- ferns ----------------------------------------------------------------------------------------------

/** Feather (pinnate palm-like) frond from `base` along azimuth a: arching rachis + drooping leaflet strokes on both sides. opts: L, lift, droop, w (leaflet length), sh, mode, salt. Returns the tip. */
function feather(g, base, a, o) {
  const sh = o.sh, mode = o.mode ?? 'keep', L = o.L, w = o.w ?? 1.6, salt = o.salt ?? 0;
  const cx = Math.cos(a), cz = Math.sin(a), px = -cz, pz = cx;
  const steps = Math.ceil(L * 1.5);
  let prev = base;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps, hd = t * L;
    const pt = [base[0] + cx * hd, base[1] + L * (o.lift ?? 0.3) * Math.sin(Math.PI * t * 0.9) - t * t * L * (o.droop ?? 0.5), base[2] + cz * hd];
    const m = shadeOf(sh, clamp(0.25 + t * 0.6 + (hash3(salt, s, 1) - 0.5) * 0.3));
    g.line(prev, pt, m, { mode });
    const ww = Math.round(Math.sin(Math.PI * Math.min(1, t * 1.15)) * w);
    if (ww > 0 && t > 0.12) for (const sd of [-1, 1]) g.line(pt, [pt[0] + px * sd * ww + cx * 0.3, pt[1] - Math.max(1, ww * 0.7), pt[2] + pz * sd * ww + cz * 0.3], m, { mode });
    prev = pt;
  }
  return prev;
}

const DIRS8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * Straight-in-plan arching frond along one of 8 grid directions (crisp fishbone from above): rachis rising from the
 * crown then drooping, pinnae on both sides. steps = length in cells, h = peak height, tip = tip height, w = pinna
 * length (1–2), every = pinnae on every n-th cell, sh = shades. Returns the tip cell.
 */
function frond8(g, p, dir, steps, h, tip, o) {
  const sh = o.sh, mode = o.mode ?? 'keep', w = o.w ?? 1, every = o.every ?? 1, salt = o.salt ?? 0;
  const ac = [-dir[1], dir[0]];
  const peak = o.peak ?? 0.4;
  const yAt = (t) => rnd(t < peak ? h * Math.sin((Math.PI / 2) * (t / peak)) : h - (h - tip) * ((t - peak) / (1 - peak)) ** 1.6);
  let py = p[1], last = null;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, y = p[1] + yAt(t), x = p[0] + dir[0] * i, z = p[2] + dir[1] * i;
    const m = t < 0.3 ? sh[0] : t > 0.85 ? sh[sh.length - 1] : sh[1];
    for (let yy = Math.min(py, y); yy <= Math.max(py, y); yy++) g.put(i === 1 || yy === y ? x : x - dir[0], yy, i === 1 || yy === y ? z : z - dir[1], yy === y ? m : yy === p[1] ? sh[0] : sh[1], mode);
    if (i >= (o.from ?? 2) && i < steps && (i + salt) % every === 0) {
      const ww = t > 0.25 && t < 0.8 ? w : Math.min(w, 1), drop = t > (o.dropAfter ?? 0.55) ? 1 : 0;
      for (const sd of [-1, 1]) for (let j = 1; j <= ww; j++) {
        const fwd = j > 1 && o.sweep !== false ? 1 : 0, dy = o.hang ? j : j > 1 ? 1 : 0;
        g.put(x + ac[0] * sd * j + dir[0] * fwd, y - drop - dy, z + ac[1] * sd * j + dir[1] * fwd, hash3(x, j, z, salt + sd) < 0.5 ? sh[sh.length - 1] : sh[1], mode);
      }
    }
    py = y; last = [x, y, z];
  }
  return last;
}

/** Ground fern rosette: 5–9 arching fronds radiating in a star (crisp from above). opts: radius (2–4), height (2–4), fronds, leaves (shades dark→light), pinnae (1–2), every, fiddlehead (bool), mode, seed */
export function fern(g, p, o = {}) {
  const R = R_(o), mode = o.mode ?? 'keep';
  const sh = mats(g, o.leaves ?? ['fernDark', 'fern', 'fernLight']);
  const r = range(o.radius, R, 2.6, 4), h = clamp(range(o.height, R, r * 0.7, r * 0.95), 1.5, 4.5);
  const n = Math.min(8, o.fronds ?? R.int(5, 8)), start = R.int(0, 7);
  const w = o.pinnae ?? (r >= 3.5 ? 2 : 1), every = o.every ?? 2;
  g.put(p[0], p[1], p[2], sh[0], mode);
  for (let i = 0; i < n; i++) {
    const dir = DIRS8[(start + Math.round((i * 8) / n)) % 8], diag = dir[0] && dir[1];
    const steps = Math.max(2, rnd((r * R.range(0.85, 1.1)) / (diag ? 1.3 : 1)));
    frond8(g, p, dir, steps, Math.max(1, h * R.range(0.8, 1.05)), h * R.range(0.1, 0.4), { sh, mode, w: diag ? 1 : w, every, salt: i + 17 * (o.seed ?? 1) });
  }
  if (o.fiddlehead ?? R.chance(0.35)) { // a young curled frond in the middle
    const y = p[1] + Math.max(1, rnd(h * 0.7)), [dx, dz] = R.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    for (let yy = p[1] + 1; yy < y; yy++) g.put(p[0], yy, p[2], sh[1], mode);
    g.put(p[0], y, p[2], sh[2], mode); g.put(p[0] + dx, y, p[2] + dz, sh[2], mode);
  }
  return g;
}

/** Tree fern: thin dark fibrous trunk topped by a star crown of long arching lacy fronds + fiddleheads. opts: height (6–10), length (frond, 4.5–7), fronds (6–7, max 8), lean, trunk (shades), leaves, seed. → { crown } */
export function treeFern(g, p, o = {}) {
  const R = R_(o), mode = o.mode ?? 'keep';
  const H = rnd(range(o.height, R, 6, 10));
  const trunk = mats(g, o.trunk ?? ['treeFernTrunk', 'treeFernTrunkLight']);
  const sh = mats(g, o.leaves ?? ['fernDark', 'fern', 'fernLight']);
  const lean = o.lean ?? R.range(0.04, 0.16), la = R() * TAU;
  const top = [rnd(p[0] + Math.cos(la) * lean * H), p[1] + H, rnd(p[2] + Math.sin(la) * lean * H)];
  const mid = [p[0] + Math.cos(la) * lean * H * 0.2, p[1] + H * 0.5, p[2] + Math.sin(la) * lean * H * 0.2];
  walk6(spline([[p[0], p[1], p[2]], mid, top], 6), (x, y, z) => g.put(x, y, z, y > p[1] + 1 && hash3(x, y, z, 31) < 0.22 ? trunk[1] : trunk[0], 'replace'));
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (R.chance(0.6)) g.put(p[0] + dx, p[1], p[2] + dz, trunk[0], mode); // root mat
  // crown knob of old frond bases + fronds
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.put(top[0] + dx, top[1] - 1, top[2] + dz, trunk[1], mode);
  g.put(top[0], top[1], top[2], sh[0], mode);
  const nf = Math.min(8, o.fronds ?? R.int(6, 7)), L0 = o.length ?? clamp(H * 0.55 + 1.5, 4.5, 7), s0 = R.int(0, 7);
  for (let f = 0; f < nf; f++) {
    const dir = DIRS8[(s0 + f) % 8], diag = dir[0] && dir[1];
    const L = Math.max(3, rnd((L0 * R.range(0.85, 1.08)) / (diag ? 1.25 : 1)));
    frond8(g, [top[0], top[1], top[2]], dir, L, R.range(0.6, 1.6), -R.range(1, 2.2), { sh, mode, w: 1, every: diag ? 1 : 2, peak: 0.3, from: 1, dropAfter: 0.5, salt: f + 101 * (o.seed ?? 1) });
  }
  // fiddleheads: young fronds uncurling in the middle
  for (let k = 0; k < 2; k++) {
    const [dx, dz] = k ? [1, 0] : [0, -1];
    g.put(top[0] + dx, top[1] + 1, top[2] + dz, sh[1], mode); g.put(top[0] + dx, top[1] + 2, top[2] + dz, sh[2], mode); g.put(top[0], top[1] + 2, top[2], sh[2], mode);
  }
  return { crown: top };
}

// ---- alocasia (giant elephant ears) ---------------------------------------------------------------------

// leaf outlines in normalized coords: s along the midrib from the stalk (0) to the tip (1), q = |across| / halfWidth
const inPoly = (poly, s, q) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [si, qi] = poly[i], [sj, qj] = poly[j]; if ((qi > q) !== (qj > q) && s < ((sj - si) * (q - qi)) / (qj - qi) + si) c = !c; } return c; };
const HEART = [[-0.04, -0.01], [-0.3, 0.42], [-0.34, 0.72], [-0.2, 0.98], [0.15, 1.02], [0.45, 0.8], [0.78, 0.38], [1.04, -0.01]];
const inHeart = (s, q) => inPoly(HEART, s, q);

/**
 * One leaf blade voxelized as a 1-voxel "standard" digital plane (6-connected, no holes at any angle). A = stalk
 * attachment, a = azimuth, tilt = radians downward, L = length, W = half-width, cup = edge droop, tipDroop,
 * shape(s, q) → inside, color(s, v, q) → id. Returns the voxel count.
 */
function blade(g, A, a, tilt, L, W, shape, color, o = {}) {
  const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(tilt), st = Math.sin(tilt);
  const D = [ca * ct, -st, sa * ct], V = [-sa, 0, ca], Nn = [ca * st, ct, sa * st];
  const thr = 0.5 * (Math.abs(Nn[0]) + Math.abs(Nn[1]) + Math.abs(Nn[2]));
  const ext = Math.ceil(L + W + 2), cup = o.cup ?? 0.2, td = o.tipDroop ?? 1, mode = o.mode ?? 'keep';
  const w0min = -cup * 1.21 * W - 0.36 * L * td;
  let n = 0;
  for (let z = Math.floor(A[2] - ext); z <= A[2] + ext; z++) for (let x = Math.floor(A[0] - ext); x <= A[0] + ext; x++) {
    const rx = x - A[0], rz = z - A[2], h = rx * Nn[0] + rz * Nn[2];  // only the few y cells near the plane
    for (let y = Math.floor(A[1] + (w0min - thr - h) / Nn[1]); y <= Math.ceil(A[1] + (thr - h) / Nn[1]); y++) {
    const ry = y - A[1];
    const u = rx * D[0] + ry * D[1] + rz * D[2], v = rx * V[0] + rz * V[2], w = rx * Nn[0] + ry * Nn[1] + rz * Nn[2];
    const s = u / L, q = Math.abs(v) / W;
    if (s < -0.5 || s > 1.1 || q > 1.1) continue;
    const w0 = -cup * q * q * W - Math.max(0, s - 0.5) ** 2 * L * td;
    if (Math.abs(w - w0) > thr || !shape(s, q)) continue;
    g.put(x, y, z, color(s, v, q), mode);
    n++;
    }
  }
  return n;
}

/** Giant elephant-ear clump: 3–5 huge heart/arrow leaves on stalks (tallest flattest, lower ones droop), pale midrib. opts: count, height (4–6), length (4.5–6.5 or [min,max]), tilt (deg, 30–42), snap (45° crisp outlines, true), rotation, veins (lateral veins), shades [base, light], vein, stem, seed */
export function alocasia(g, p, o = {}) {
  const R = R_(o), mode = o.mode ?? 'keep';
  const [dark, light] = mats(g, o.shades ?? ['alocasia', 'alocasiaLight']);
  const vein = g.mat(o.vein ?? 'alocasiaVein'), stem = g.mat(o.stem ?? 'alocasiaStem');
  const n = o.count ?? R.int(3, 5), H = range(o.height, R, 4, 6);
  const a0 = o.rotation != null ? (o.rotation * Math.PI) / 180 : R.int(0, 7) * (Math.PI / 4);
  const leaves = [], off = R();
  for (let i = 0; i < n; i++) {
    const k = i / Math.max(1, n - 1);
    // directions snapped to 45° (crisp voxel outlines), spread evenly; i = 0 is the tallest leaf
    const a = a0 + (o.snap === false ? (i / n) * TAU + R.range(-0.3, 0.3) : (Math.round((i * 8) / n + off) % 8) * (Math.PI / 4));
    const L = range(o.length, R, 4.5, 6.5) * (1 - k * 0.2), tilt = (range(o.tilt, R, 30, 42) + k * 22) * Math.PI / 180;
    const ds = 0.34 * L * Math.cos(tilt) + R.range(0.6, 1.2) + k * 1.2;   // keep the back lobes clear of the centre
    const A = [p[0] + Math.cos(a) * ds, p[1] + Math.max(2.5, H * (1 - k * 0.45) * R.range(0.92, 1) - 0.5), p[2] + Math.sin(a) * ds];
    leaves.push({ a, L, A, tilt, base: i % 2 ? light : dark });
  }
  for (const lf of leaves) {
    const W = lf.L * 0.52;
    blade(g, lf.A, lf.a, lf.tilt, lf.L, W, inHeart, (s, v, q) => {
      if (Math.abs(v) < 0.5 && s > -0.05 && s < 0.9) return vein;
      if (o.veins && q > 0.35 && q < 0.8 && s > 0.1) { const ph = (s * lf.L - Math.abs(v) * 0.8) / 2; if (ph - Math.floor(ph) < 0.25) return lf.base === dark ? light : dark; }
      return lf.base;
    }, { mode, cup: 0.15, tipDroop: 0.6 });
  }
  for (const lf of leaves) {
    const b = [p[0] + Math.cos(lf.a) * 0.4, p[1], p[2] + Math.sin(lf.a) * 0.4];
    g.line(b, [lf.A[0] - Math.cos(lf.a) * 0.4, lf.A[1], lf.A[2] - Math.sin(lf.a) * 0.4], stem, { mode });
  }
  g.put(p[0], p[1], p[2], stem, mode);
  return g;
}

// ---- rafflesia ------------------------------------------------------------------------------------------

/**
 * Rafflesia kerrii, the giant forest-floor flower: 5 thick rounded warty petals, a raised central cup with a dark
 * opening and a ring of spikes inside. Stylized larger than life. opts: diameter (7–9), rotation (deg), petal, dark,
 * spot, core, rim, buds (count of brown cabbage buds nearby), vine (Tetrastigma host vine on the ground, true), seed. → { center, top }
 */
export function rafflesia(g, p, o = {}) {
  const R = R_(o);
  const D = o.diameter ?? 9, Rr = D / 2, mode = o.mode ?? 'replace';
  const [red, dark, spot, core, rim] = mats(g, [o.petal ?? 'rafflesia', o.dark ?? 'rafflesiaDark', o.spot ?? 'rafflesiaSpot', o.core ?? 'rafflesiaCore', o.rim ?? 'rafflesiaRim']);
  const rot = o.rotation != null ? (o.rotation * Math.PI) / 180 : R() * TAU;
  const [cx, y0, cz] = p;
  const holeR = Math.max(0.5, D * 0.15 - 0.4), cupR = Math.max(holeR + 0.9, D * 0.2), rc = Rr * 0.6, rp = Rr * 0.43;
  const ext = Math.ceil(Rr + 1);
  // per-column classification: hole | cup | petal (pd = distance to the nearest petal centre, 0..1)
  const cell = new Map(), K = (x, z) => x + ',' + z;
  for (let dz = -ext; dz <= ext; dz++) for (let dx = -ext; dx <= ext; dx++) {
    const r = Math.hypot(dx, dz);
    let best = Infinity, second = Infinity;
    for (let k = 0; k < 5; k++) {
      const a = rot + (k * TAU) / 5, ex = Math.cos(a) * rc, ez = Math.sin(a) * rc;
      const ux = dx - ex, uz = dz - ez, ur = (ux * Math.cos(a) + uz * Math.sin(a)) / 1.1, ut = (-ux * Math.sin(a) + uz * Math.cos(a)) / 0.97;
      const d = Math.hypot(ur, ut) / rp;
      if (d < best) { second = best; best = d; } else if (d < second) second = d;
    }
    const kind = r < holeR ? 'hole' : r < cupR ? 'cup' : best <= 1 || r < cupR + 0.45 ? 'petal' : null;
    if (kind) cell.set(K(dx, dz), { dx, dz, r, kind, pd: best, seam: second - best < 0.2 });
  }
  const spots = new Set();
  const spotty = (dx, dz, y, dens) => { // pale warts, never touching each other
    if (hash3(cx + dx, y, cz + dz, 77 + (o.seed ?? 1)) >= dens) return false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && spots.has(K(dx + i, dz + j))) return false;
    spots.add(K(dx, dz));
    return true;
  };
  const cells = [...cell.values()].sort((a, b) => a.r - b.r);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const c of cells) {
    const { dx, dz, r, kind } = c, x = cx + dx, z = cz + dz;
    if (kind === 'petal') { // a thick fleshy plateau with a one-step bevel at the rim and grooves between lobes
      const rimCell = N4.some(([i, j]) => !cell.has(K(dx + i, dz + j)));
      const thick = !rimCell && !c.seam;
      const topY = thick ? y0 + 1 : y0;
      if (thick) g.put(x, y0, z, dark, mode);
      const m = c.seam || r < cupR + 0.5 ? dark : spotty(dx, dz, topY, rimCell ? 0.3 : 0.42) ? spot : r > Rr * 0.8 ? rim : red;
      g.put(x, topY, z, m, mode);
    } else if (kind === 'cup') { // the raised diaphragm: warty outside, a paler smooth lip around the opening
      const lip = N4.some(([i, j]) => cell.get(K(dx + i, dz + j))?.kind === 'hole');
      g.put(x, y0, z, dark, mode); g.put(x, y0 + 1, z, lip ? dark : red, mode);
      g.put(x, y0 + 2, z, lip ? rim : spotty(dx, dz, y0 + 2, 0.5) ? spot : red, mode);
    } else { // the opening: a dark well; pale spikes (processes) ring the central disc
      g.put(x, y0, z, core, mode);
      const ring = holeR > 1.3 ? r > 0.5 && (dx + dz) % 2 !== 0 : holeR > 0.99 && r < 0.5;
      if (ring) g.put(x, y0 + 1, z, spot, mode);
    }
  }
  // host vine (Tetrastigma) snaking over the ground, and brown cabbage-like buds along it
  const lv = mats(g, ['liana', 'lianaDark']), bud = mats(g, ['rafflesiaBud', 'rafflesiaBudDark']);
  const va = rot + R.range(0.3, 0.6) * Math.PI;
  const vine = [];
  if (o.vine !== false) {
    const len = Rr + 4 + (o.buds ?? 0) * 1.5;
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6 * 2 - 1, d = t * len;
      pts.push([cx + Math.cos(va) * d + Math.sin(va) * Math.sin(t * 2.4 + 1) * 1.6, y0, cz + Math.sin(va) * d - Math.cos(va) * Math.sin(t * 2.4 + 1) * 1.6]);
    }
    walk6(pts.map((q) => [q[0], y0, q[2]]), (x, y, z, i) => { if (!g.get(x, y, z)) { g.set(x, y, z, i % 4 === 0 ? lv[1] : lv[0]); vine.push([x, z]); } });
  }
  const nb = o.buds ?? 0;
  for (let i = 0; i < nb; i++) {
    let bx, bz;
    const far = vine.filter(([x, z]) => Math.hypot(x - cx, z - cz) > Rr + 1.2);
    if (far.length) [bx, bz] = far[Math.floor(R() * far.length)];
    else { const a = R() * TAU, d = Rr + R.range(1.5, 3); bx = rnd(cx + Math.cos(a) * d); bz = rnd(cz + Math.sin(a) * d); }
    const big = R.chance(0.6), dd = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    if (big) { // 3×3 cabbage: bract layers alternating shades, closed top
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (!(j && k) || R.chance(0.5)) g.put(bx + j, y0, bz + k, (j + k) & 1 ? bud[1] : bud[0], 'keep');
      for (const [j, k] of dd) g.put(bx + j, y0 + 1, bz + k, R.chance(0.5) ? bud[1] : bud[0], 'keep');
      g.put(bx, y0 + 1, bz, bud[0], 'keep'); g.put(bx, y0 + 2, bz, R.chance(0.4) ? dark : bud[1], 'keep'); // some buds show red at the tip
    } else {
      g.put(bx, y0, bz, bud[0], 'keep'); g.put(bx, y0 + 1, bz, bud[1], 'keep');
      const [j, k] = R.pick(dd); g.put(bx + j, y0, bz + k, bud[1], 'keep');
    }
  }
  return { center: [cx, y0, cz], top: [cx, y0 + 2, cz] };
}

// ---- heliconia ------------------------------------------------------------------------------------------

/** Heliconia (lobster-claw): tall paddle leaves + zig-zag spikes of red boat-shaped bracts with yellow tips. opts: height (4–6), count (leaves), form 'upright'|'hanging', spikes (1–2), bracts, leaves [light, dark], bract, tip, seed */
export function heliconia(g, p, o = {}) {
  const R = R_(o), mode = o.mode ?? 'keep';
  const H = range(o.height, R, 4, 6);
  const [lf, lfd] = mats(g, o.leaves ?? ['heliconiaLeaf', 'heliconiaLeafDark']);
  const red = g.mat(o.bract ?? 'heliconia'), tip = g.mat(o.tip ?? 'heliconiaTip');
  const n = o.count ?? R.int(4, 6), a0 = R.int(0, 7);
  const form = o.form ?? 'upright';
  const put = (q, m) => g.put(q[0], q[1], q[2], m, mode);
  // inflorescences first (they must win over leaves): bracts alternate sides in one vertical plane
  const ns = o.spikes ?? (H > 5 ? 2 : 1), tops = [];
  for (let k = 0; k < ns; k++) {
    const along = (k + a0) % 2 ? [1, 0] : [0, 1], perp = [along[1], along[0]];
    const ox = p[0] + (k ? R.pick([-1, 1]) * perp[0] : 0), oz = p[2] + (k ? R.pick([-1, 1]) * perp[1] : 0);
    const at = (u, y) => [ox + along[0] * u, y, oz + along[1] * u];
    let nb = o.bracts ?? R.int(3, 5);
    if (form === 'hanging') { // stalk arching out past the leaves, pendent zig-zag; claws open upward, biggest at the top
      const top = p[1] + rnd(H * (k ? 0.9 : 1.1)) + 1, u0 = 3;
      nb = Math.max(1, Math.min(nb, Math.floor((top - p[1] - 2) / 1.6)));
      for (let y = p[1]; y < top; y++) put(at(y > top - 3 ? 1 : 0, y), lfd);
      put(at(1, top), lfd); put(at(2, top + 1), lfd); put(at(3, top), red);
      let y = top - 1;
      for (let i = 0; i < nb; i++) {
        const s = i % 2 ? 1 : -1, big = i < nb - 1, yb = top - 1 - rnd(i * 1.6);
        for (; y >= yb - 1; y--) put(at(u0, y), red);
        put(at(u0 + s, yb - 1), red);
        if (big) { put(at(u0 + 2 * s, yb - 1), red); put(at(u0 + 2 * s, yb), red); put(at(u0 + 3 * s, yb + 1), tip); } else put(at(u0 + 2 * s, yb), tip);
      }
      put(at(u0, y), tip);
      tops.push(at(1, top));
    } else { // upright: stalk, then claws pointing out and up, biggest at the bottom
      const y0 = p[1] + rnd(H * (k ? 0.4 : 0.5));
      for (let y = p[1]; y < y0; y++) put(at(0, y), lfd);
      let y = y0;
      for (let i = 0; i < nb; i++) {
        const s = i % 2 ? 1 : -1, big = i < nb - 1, yb = y0 + rnd(i * 1.6);
        for (; y <= yb + 1; y++) put(at(0, y), red);
        put(at(s, yb), red);
        if (big) { put(at(2 * s, yb), red); put(at(2 * s, yb + 1), red); put(at(3 * s, yb + 2), tip); } else put(at(2 * s, yb + 1), tip);
      }
      put(at(0, y), tip);
      tops.push(at(0, y));
    }
  }
  // leaves: two-ranked fan (like a banana / bird of paradise) across the spike plane: long petiole, then a paddle
  // blade held steeply up and bending out, with a few tears
  const fan = (a0 + 1) % 2 ? 0 : 2;  // DIRS8 index of the fan axis (perpendicular to the first spike's plane)
  for (let i = 0; i < n; i++) {
    const dir = DIRS8[(fan + (i % 2) * 4 + (i >= 2 ? R.pick([-1, 0, 1]) : 0) + 8) % 8], dl = Math.hypot(dir[0], dir[1]), cx = dir[0] / dl, cz = dir[1] / dl, px = -cz, pz = cx;
    const hp = H * (0.3 + (i / n) * 0.3) * R.range(0.9, 1.1), off = R.range(0.3, 1);
    const P1 = [p[0] + cx * off, p[1] + hp, p[2] + cz * off];
    g.line([p[0], p[1], p[2]], P1, lfd, { mode });
    const Lb = Math.max(3, H * R.range(0.85, 1.05)), e = R.range(1.15, 1.4) - (i < 2 ? 0.25 : 0), Wb = R.range(0.9, 1.3);
    const steps = Math.ceil(Lb * 2), c = P1.slice();
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, ee = e - t * 0.75;   // the blade bends outward as it goes
      c[0] += (cx * Math.cos(ee) * Lb) / steps; c[1] += (Math.sin(ee) * Lb) / steps; c[2] += (cz * Math.cos(ee) * Lb) / steps;
      g.put(rnd(c[0]), rnd(c[1]), rnd(c[2]), lfd, mode);
      const w = Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.5 * Wb;
      for (const side of [-1, 1]) for (let j = 1; j <= rnd(w); j++) {
        if (hash3(i, s, side + 40, o.seed ?? 1) < 0.12) continue; // tattered edge
        g.put(rnd(c[0] + px * side * j), rnd(c[1] - j * 0.25), rnd(c[2] + pz * side * j), lf, mode);
      }
    }
  }
  return { tops };
}

// ---- rattan ---------------------------------------------------------------------------------------------

/** Climbing rattan palm: thin spiny stems climbing (toward `to`, e.g. a trunk) and arching over, feathery drooping fronds, whip tips. opts: height (8–16), to [x,y,z], stems (1–3), stem [main, dark], leaves, seed. → { tips } */
export function rattan(g, p, o = {}) {
  const R = R_(o), mode = o.mode ?? 'keep';
  const [stem, stemDark] = mats(g, o.stem ?? ['rattanStem', 'rattanStemDark']);
  const sh = mats(g, o.leaves ?? ['rattanLeaf', 'rattanLeaf', 'rattanLeaf', 'rattanLeafLight']);
  const ns = o.stems ?? R.int(1, 3), tips = [];
  for (let k = 0; k < ns; k++) {
    const H = range(o.height, R, 8, 16) * (k ? R.range(0.6, 0.85) : 1);
    const base = [p[0] + (k ? R.int(-1, 1) : 0), p[1], p[2] + (k ? R.int(-1, 1) : 0)];
    let ctrl;
    if (o.to) { // lean on the target (a trunk side / branch), climb a little past it, then arch back out and droop
      const t = o.to, dx = t[0] - base[0], dz = t[2] - base[2], d = Math.hypot(dx, dz) || 1;
      const ux = dx / d, uz = dz / d, ty = Math.min(t[1], base[1] + H) - (k ? R.range(2, 5) : 0), j = R.range(-2, 2), sx = -uz * j, sz = ux * j;
      ctrl = [base, [base[0] + dx * 0.45 + sx * 0.5, base[1] + (ty - base[1]) * 0.45, base[2] + dz * 0.45 + sz * 0.5], [t[0] - ux + sx, ty, t[2] - uz + sz],
        [t[0] - ux * 2.5 + sx * 1.5, ty + 2, t[2] - uz * 2.5 + sz * 1.5], [t[0] - ux * 5.5 + sx * 2, ty - R.range(0, 1.5), t[2] - uz * 5.5 + sz * 2]];
    } else {
      const a = (o.angle != null ? (o.angle * Math.PI) / 180 : R() * TAU) + k * R.range(0.8, 1.6), ux = Math.cos(a), uz = Math.sin(a), lean = H * R.range(0.4, 0.6);
      ctrl = [base, [base[0] + ux * lean * 0.1, base[1] + H * 0.55, base[2] + uz * lean * 0.1], [base[0] + ux * lean * 0.55, base[1] + H, base[2] + uz * lean * 0.55], [base[0] + ux * lean, base[1] + H * 0.8, base[2] + uz * lean]];
    }
    const path = [];
    trace(spline(ctrl, 8), (x, y, z, i) => { g.put(x, y, z, i % 3 === 2 ? stemDark : stem, 'keep'); path.push([x, y, z]); });
    const end = path[path.length - 1];
    tips.push(end);
    // feathery fronds along the upper part, alternating sides, leaflets hanging; some end in a whip (cirrus)
    const n = path.length;
    // feathery fronds along the upper part, alternating sides (away from the support), some ending in a whip (cirrus)
    const away = o.to ? Math.atan2(base[2] - o.to[2], base[0] - o.to[0]) : null;
    let side = R.sign();
    for (let i = Math.floor(n * 0.45); i < n - 1; i += R.int(3, 5)) {
      const q = path[i], nx = path[Math.min(n - 1, i + 3)], ta = Math.atan2(nx[2] - q[2], nx[0] - q[0]);
      const a = (away ?? ta) + side * R.range(0.5, 1.3) + (away == null ? side * 0.4 : 0);
      side = -side;
      const L = R.range(3.5, 5.5) * (i > n * 0.9 ? 0.6 : 1);
      const e = feather(g, q, a, { L, sh, mode, w: R.range(1.4, 2), lift: R.range(0.15, 0.4), droop: R.range(0.4, 0.7), salt: i * 7 + k * 131 + (o.seed ?? 1) });
      if (hash3(i, k, 5, o.seed ?? 1) < 0.5) g.line(e, [e[0] + Math.cos(a) * 2.5, e[1] - 2, e[2] + Math.sin(a) * 2.5], stem, { mode });
    }
    // young fronds at the tip
    g.put(end[0], end[1] + 1, end[2], sh[1], mode);
    for (let j = 0; j < 2; j++) feather(g, [end[0], end[1] + 1, end[2]], R() * TAU, { L: R.range(2, 3), sh, mode, w: 1.2, lift: 0.6, droop: 0.4 });
  }
  return { tips };
}

// ---- lianas ---------------------------------------------------------------------------------------------

/**
 * Hanging woody vine from a to b, 1 voxel thick: a steep drop hangs straight then swings to b near the bottom (hang:
 * auto), a span between two high points swags (sag). Twists, optional loops, leaf tufts and a coil on the ground.
 * opts: sag (fraction of length), hang, twist (lateral wobble), loops (count), leaves (tuft chance per voxel, 0.05),
 * thick (doubled for the lowest `thick` voxels), coil (voxels lying on the ground at b), shades [main, dark], leaf, seed.
 * → { path, mid }
 */
export function liana(g, a, b, o = {}) {
  const R = R_(o);
  const [main, dark] = mats(g, o.shades ?? ['liana', 'lianaDark']), leaf = g.mat(o.leaf ?? 'lianaLeaf');
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], hd = Math.hypot(d[0], d[2]), len = Math.hypot(d[0], d[1], d[2]) || 1;
  const side = hd > 0.5 ? [-d[2] / hd, 0, d[0] / hd] : (([c, s]) => [c, 0, s])([Math.cos(R() * TAU), Math.sin(R() * TAU)]);
  const hang = o.hang ?? -d[1] > hd * 1.2;            // a mostly vertical drop hangs straight, then swings to b near the bottom
  const sag = (o.sag ?? R.range(0.08, 0.2)) * len;
  const tw = o.twist ?? R.range(0.3, 0.9), ph = R() * TAU, waves = R.range(0.8, 1.8);
  const nP = Math.max(4, Math.ceil(len / 2.5));
  const pts = [];
  for (let i = 0; i <= nP; i++) {
    const t = i / nP, w = Math.sin(t * Math.PI * waves + ph) * tw * Math.sin(Math.PI * t);
    const f = hang ? t ** 2.4 : t;
    pts.push([a[0] + d[0] * f + side[0] * w, a[1] + d[1] * t - (hang ? 0 : sag * 4 * t * (1 - t)), a[2] + d[2] * f + side[2] * w]);
  }
  let path = spline(pts, 4);
  const loops = o.loops ?? (R.chance(0.25) ? 1 : 0);
  for (let l = 0; l < loops; l++) { // splice a small hanging loop in
    const at = Math.floor(path.length * R.range(0.3, 0.7)), c = path[at], lr = R.range(1.3, 2), ring = [];
    for (let k = 1; k < 12; k++) { const t = (k / 12) * TAU; ring.push([c[0] + side[0] * Math.sin(t) * lr, c[1] - (1 - Math.cos(t)) * lr, c[2] + side[2] * Math.sin(t) * lr]); }
    path = path.slice(0, at + 1).concat(ring, path.slice(at));
  }
  if (o.coil) { // the end lies on the ground in a lazy curl
    const ca = R() * TAU;
    for (let k = 1; k <= o.coil; k++) path.push([b[0] + Math.cos(ca + k * 0.5) * k * 0.8, b[1], b[2] + Math.sin(ca + k * 0.5) * k * 0.8]);
  }
  const cells = [], seed = o.seed ?? R.int(0, 1e6);
  trace(path, (x, y, z) => { cells.push([x, y, z]); g.put(x, y, z, hash3(x, y, z, seed) < 0.22 ? dark : main, 'keep'); });
  const thick = o.thick ?? 0;
  if (thick > 0) { // the old woody base: doubled near the ground
    const yMin = Math.min(...cells.map((c) => c[1])), ax = R.pick([[1, 0], [0, 1]]);
    for (const [x, y, z] of cells) if (y < yMin + thick) g.put(x + ax[0], y, z + ax[1], dark, 'keep');
  }
  const lc = o.leaves ?? 0.05;
  for (let i = 3; i < cells.length - 1; i++) {
    if (hash3(cells[i][0], cells[i][1], cells[i][2], seed + 61) >= lc) continue;
    const [x, y, z] = cells[i];
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 1], [1, 1, 0], [0, -1, 0]]) if (hash3(x + dx, y + dy, z + dz, 62) < 0.5) g.put(x + dx, y + dy, z + dz, leaf, 'keep');
  }
  return { path: cells, mid: cells[Math.floor(cells.length / 2)] };
}

/**
 * Drape lianas from anchor points (branch tips): most hang to the ground below (found with the grid, skipping
 * foliage) and coil there, some swag across to a nearby anchor, some dangle free with a leafy end.
 * opts: connect (0.3 chance), reach (max swag span, 24), dangle (0.2), drift (ground-end offset, 3), coil, thick (chance 0.35),
 * ground (y or (x,z) → y override), chance (fraction of anchors used, 1), + liana opts, seed. → count
 */
export function lianas(g, anchors, o = {}) {
  const R = R_(o);
  const used = new Set();
  let count = 0;
  const groundY = (x, z, from) => {
    if (typeof o.ground === 'number') return o.ground;
    if (typeof o.ground === 'function') return o.ground(x, z);
    let y = from - 3;
    for (; y >= from - 200; y--) { const id = g.get(x, y, z); if (id && !isFoliage(g, id)) break; }
    return y < from - 200 || isWater(g, g.get(x, y, z)) ? null : y;   // over water: dangle instead
  };
  anchors.forEach((a, i) => {
    if (R() > (o.chance ?? 1)) return;
    const lo = { ...o, seed: undefined, R: R.fork ? R.fork(i + 1) : rng((o.seed ?? 1) * 977 + i) };
    const top = [rnd(a[0]), rnd(a[1]) - 1, rnd(a[2])];
    if (R.chance(o.connect ?? 0.3)) { // swag to the nearest unused anchor within reach
      let best = -1, bd = o.reach ?? 24;
      anchors.forEach((b, j) => { const dd = Math.hypot(b[0] - a[0], b[2] - a[2]); if (j !== i && !used.has(j + ',' + i) && dd > 4 && dd < bd) { bd = dd; best = j; } });
      if (best >= 0) {
        used.add(i + ',' + best);
        const b = anchors[best];
        liana(g, top, [rnd(b[0]), rnd(b[1]) - 1, rnd(b[2])], { ...lo, sag: R.range(0.2, 0.4) });
        count++;
        if (R.chance(0.5)) return;
      }
    }
    const dr = o.drift ?? 3;
    const ex = rnd(top[0] + R.range(-dr, dr)), ez = rnd(top[2] + R.range(-dr, dr));
    const gy = groundY(ex, ez, top[1]);
    if (gy == null || R.chance(o.dangle ?? 0.2)) { // free end with a leafy tassel
      const L = gy == null ? R.range(6, 14) : (top[1] - gy) * R.range(0.3, 0.7);
      if (gy == null && o.ground == null) { const b = g.bounds(); if (b && top[1] - L < b.min[1] + 1) return; }
      const r = liana(g, top, [ex, rnd(top[1] - L), ez], { ...lo, sag: 0.05, leaves: (o.leaves ?? 0.05) * 1.5 });
      const e = r.path[r.path.length - 1];
      for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, -1, 0], [0, -1, 1]]) g.put(e[0] + dx, e[1] + dy, e[2] + dz, g.mat(o.leaf ?? 'lianaLeaf'), 'keep');
    } else {
      liana(g, top, [ex, gy + 1, ez], { ...lo, sag: R.range(0.03, 0.1), coil: o.coil ?? R.int(0, 4), thick: R.chance(o.thick ?? 0.35) ? R.int(2, 5) : 0 });
    }
    count++;
  });
  return count;
}

// ---- epiphytes ------------------------------------------------------------------------------------------

/**
 * Scatter epiphytes over existing branches/trunks: orchid sprays, red bromeliads, small ferns and moss clumps sitting on
 * top of branches and clinging to trunk sides. opts: area ([[x0,y0,z0],[x1,y1,z1]] or [[x0,z0],[x1,z1]] + y: [y0, y1]),
 * on (bark material names, default 'bark' + JUNGLE barks if present), density (0.12), side (0.4: relative density on
 * sides), mix { moss, bromeliad, orchid, fern }, spacing (3), paint (moss-stains the host voxel, true), seed. → count
 */
export function epiphytes(g, o = {}) {
  const R = R_(o);
  const P = g.palette;
  const onNames = o.on ?? ['bark', 'barkDark', 'barkLight', 'barkPale', 'barkPaleDark', 'figRoot', 'log', 'treeFernTrunk'].filter((n) => P?.has(n));
  const on = new Set(mats(g, onNames));
  const bb = g.bounds();
  if (!bb) return 0;
  let a3, b3;
  if (o.area && o.area[0].length === 3) [a3, b3] = o.area;
  else if (o.area) { const yy = o.y ?? [bb.min[1], bb.max[1]]; a3 = [o.area[0][0], yy[0], o.area[0][1]]; b3 = [o.area[1][0], yy[1], o.area[1][1]]; }
  else [a3, b3] = [bb.min, bb.max];
  const lo = [0, 1, 2].map((k) => Math.min(a3[k], b3[k])), hi = [0, 1, 2].map((k) => Math.max(a3[k], b3[k]));
  const dens = o.density ?? 0.12, sideK = o.side ?? 0.4, sp = o.spacing ?? 3, seed = o.seed ?? 1;
  const mix = { moss: 4, bromeliad: 2.5, orchid: 2.5, fern: 1.5, ...o.mix };
  const sites = [];
  g.forEachIn(lo, hi, (x, y, z, id) => {
    if (!on.has(id)) return;
    if (!g.get(x, y + 1, z) && !g.get(x, y + 2, z)) { if (hash3(x, y, z, seed + 3) < dens) sites.push([x, y, z, 0, 0]); return; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g.get(x + dx, y, z + dz) && !g.get(x + dx * 2, y, z + dz * 2) && hash3(x * 4 + dx, y, z * 4 + dz, seed + 4) < dens * sideK * 0.5) { sites.push([x, y, z, dx, dz]); break; }
  });
  const taken = new Set(), key = (x, y, z) => Math.floor(x / sp) + ',' + Math.floor(y / sp) + ',' + Math.floor(z / sp);
  const M = (n) => g.mat(n);
  const moss = M(o.moss ?? 'mossDeep'), brom = M(o.bromeliad ?? 'bromeliad'), bleaf = M(o.bromeliadLeaf ?? 'bromeliadLeaf');
  const orch = mats(g, o.orchids ?? ['orchid', 'orchidWhite']), fsh = mats(g, o.leaves ?? ['fernDark', 'fern', 'fernLight']);
  const put = (x, y, z, m) => g.put(x, y, z, m, 'keep');
  const types = Object.entries(mix).filter(([, w]) => w > 0);
  let count = 0;
  for (const [x, y, z, dx, dz] of sites) {
    const k = key(x, y, z);
    if (taken.has(k)) continue;
    taken.add(k); count++;
    const type = R.weighted(types), top = !dx && !dz;
    if (o.paint !== false && (type === 'moss' || R.chance(0.4))) g.set(x, y, z, moss);
    if (top) {
      if (type === 'moss') { put(x, y + 1, z, moss); for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (on.has(g.get(x + i, y, z + j)) && R.chance(0.6)) { g.set(x + i, y, z + j, moss); if (R.chance(0.4)) put(x + i, y + 1, z + j, moss); } }
      else if (type === 'bromeliad') {
        for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + i, y + 1, z + j, bleaf);
        for (const [i, j] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) if (R.chance(0.7)) put(x + i, y + 2, z + j, bleaf);
        put(x, y + 1, z, brom); put(x, y + 2, z, brom); if (R.chance(0.5)) put(x, y + 3, z, brom);
      } else if (type === 'orchid') { // strap leaves + an arching spray of flowers cascading off the branch
        const [i, j] = R.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]), fl = R.pick(orch), alt = orch[(orch.indexOf(fl) + 1) % orch.length];
        put(x, y + 1, z, bleaf); put(x - i, y + 1, z - j, bleaf); put(x + j, y + 1, z + i, bleaf);
        put(x + i, y + 2, z + j, fsh[0]); put(x + 2 * i, y + 2, z + 2 * j, fsh[0]);
        put(x + 3 * i, y + 2, z + 3 * j, fl); put(x + 3 * i, y + 1, z + 3 * j, fsh[0]); put(x + 3 * i + j, y + 1, z + 3 * j + i, fl);
        put(x + 3 * i, y, z + 3 * j, fl); put(x + 3 * i - j, y, z + 3 * j - i, alt); put(x + 3 * i, y - 1, z + 3 * j, fl);
      } else fern(g, [x, y + 1, z], { R, radius: R.range(1.4, 2), height: R.range(1, 2), fronds: R.int(4, 6), every: 1, leaves: fsh, fiddlehead: false });
    } else { // clinging on a trunk side
      const ox = x + dx, oz = z + dz;
      if (type === 'moss') { put(ox, y, oz, moss); if (R.chance(0.6)) put(ox, y - 1, oz, moss); if (R.chance(0.4)) put(ox, y + 1, oz, moss); }
      else if (type === 'bromeliad') { put(ox, y, oz, bleaf); put(ox, y + 1, oz, brom); put(ox + dx, y + 1, oz + dz, bleaf); put(ox + dz, y + 1, oz + dx, bleaf); put(ox - dz, y + 1, oz - dx, bleaf); put(ox, y + 2, oz, brom); }
      else if (type === 'orchid') { const fl = R.pick(orch); put(ox, y, oz, bleaf); put(ox, y + 1, oz, bleaf); put(ox + dz, y, oz + dx, bleaf); put(ox + dx, y, oz + dz, fsh[0]); put(ox + dx, y - 1, oz + dz, fl); put(ox + dx + dz, y - 2, oz + dz + dx, fl); put(ox + dx, y - 2, oz + dz, fsh[0]); put(ox + dx, y - 3, oz + dz, fl); put(ox + dx - dz, y - 3, oz + dz - dx, fl); put(ox + dx, y - 4, oz + dz, fl); }
      else { // staghorn-ish fan sticking out sideways
        put(ox, y, oz, fsh[0]); put(ox + dx, y + 1, oz + dz, fsh[1]); put(ox + dx + dz, y + 1, oz + dz + dx, fsh[2]); put(ox + dx - dz, y + 1, oz + dz - dx, fsh[2]);
        put(ox + dx, y - 1, oz + dz, fsh[1]); put(ox + 2 * dx, y - 1, oz + 2 * dz, fsh[2]);
      }
    }
  }
  return count;
}

// ---- water plants ---------------------------------------------------------------------------------------

/** Lotus / water lily on a short stem from the water. p = the cell above the water surface. opts: stem (0–3 voxels), bud (closed), petal, light, center, stemMat, seed */
export function lotus(g, p, o = {}) {
  const R = R_(o), mode = o.mode ?? 'keep';
  const [pet, lt, ctr, st] = mats(g, [o.petal ?? 'lotus', o.light ?? 'lotusLight', o.center ?? 'lotusCenter', o.stemMat ?? 'lilyPadDark']);
  const h = o.stem ?? R.int(0, 2), [x, y0, z] = p;
  for (let i = 0; i < h; i++) g.put(x, y0 + i, z, st, mode);
  const y = y0 + h;
  if (o.bud) { g.put(x, y, z, pet, mode); g.put(x, y + 1, z, pet, mode); g.put(x, y + 2, z, lt, mode); return g; }
  g.put(x, y, z, ctr, mode);
  for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.put(x + i, y, z + j, pet, mode);
  if (o.size !== 'small') { // open lotus: petal tips curling up on the diagonals, a raised seed-head
    for (const [i, j] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) g.put(x + i, y + 1, z + j, lt, mode);
    g.put(x, y + 1, z, ctr, mode);
  }
  return g;
}

/**
 * Lily pads floating on water in [x0,z0]–[x1,z1]: clusters of rounded notched pads (2×2 … 5×5) one voxel above the
 * water surface, plus lotus flowers/buds on short stems. opts: y (water surface y; default: every column whose top
 * voxel is water), coverage (0.22), clusters, flowers (0.6 = chance per cluster), shades [dark, mid, light], water (id),
 * seed. → count
 */
export function lilyPads(g, a, b, o = {}) {
  const R = R_(o);
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[a.length - 1], b[b.length - 1]), z1 = Math.max(a[a.length - 1], b[b.length - 1]);
  const T = g.tops(x0, z0, x1, z1), W = T.W;
  const wid = o.water != null ? g.mat(o.water) : null;
  const surf = new Int32Array(T.y.length).fill(-2147483648), cells = [];
  for (let i = 0; i < T.y.length; i++) {
    const id = T.id[i];
    if (!id || !(wid ? id === wid : isWater(g, id)) || (o.y != null && T.y[i] !== o.y)) continue;
    surf[i] = T.y[i]; cells.push(i);
  }
  if (!cells.length) return 0;
  const sh = mats(g, o.shades ?? ['lilyPadDark', 'lilyPad', 'lilyPadLight']);
  const occ = new Uint8Array(T.y.length);
  const idx = (x, z) => (x < x0 || x > x1 || z < z0 || z > z1 ? -1 : x - x0 + (z - z0) * W);
  const nCl = o.clusters ?? Math.max(1, rnd((cells.length * (o.coverage ?? 0.22)) / 30));
  let count = 0;
  for (let c = 0; c < nCl; c++) {
    const ci = cells[Math.floor(R() * cells.length)], ccx = x0 + (ci % W), ccz = z0 + Math.floor(ci / W);
    const n = R.int(3, 7), spread = R.range(2, 3.5);
    for (let t = 0, placed = 0; t < n * 4 && placed < n; t++) {
      const size = R.weighted([[2, 2], [3, 4], [4, 3], [5, 1.2]]), hs = (size - 1) / 2;
      const x0p = rnd(ccx + R.gauss() * spread - hs), z0p = rnd(ccz + R.gauss() * spread - hs);
      const nd = DIRS8[R.int(0, 7)], foot = [];
      let ok = true, y = null;
      for (let j = 0; j < size && ok; j++) for (let i = 0; i < size && ok; i++) {
        const u = i - hs, v = j - hs, corner = Math.abs(u) === hs && Math.abs(v) === hs;
        if (corner && size >= 4) continue;                                   // round off big pads
        if (size === 3 && u === nd[0] && v === nd[1] && (nd[0] && nd[1])) continue; // notch: a missing corner
        if (size >= 4) { const k = u * nd[0] + v * nd[1], off = Math.abs(u * nd[1] - v * nd[0]); if (k > 0.2 && off < (nd[0] && nd[1] ? 0.8 : 0.6)) continue; } // notch: a slit to the edge
        const x = x0p + i, z = z0p + j, k = idx(x, z);
        if (k < 0 || surf[k] === -2147483648 || occ[k] || (y != null && surf[k] !== y)) { ok = false; break; }
        y = surf[k]; foot.push([x, z, Math.hypot(u, v)]);
      }
      if (!ok || foot.length < 3) continue;
      const m = R.pick(sh);
      for (const [x, z, d] of foot) {
        g.put(x, y + 1, z, size >= 4 && d < 0.8 && m !== sh[2] ? sh[2] : m, 'keep');
        for (const [i, j] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = idx(x + i, z + j); if (k >= 0) occ[k] = 1; }
      }
      count++; placed++;
    }
    if (R() < (o.flowers ?? 0.6)) for (let f = R.int(1, 2); f > 0; f--) for (let t = 0; t < 12; t++) {
      const fx = rnd(ccx + R.gauss() * spread), fz = rnd(ccz + R.gauss() * spread), i = idx(fx, fz);
      if (i < 0 || surf[i] === -2147483648) continue;
      let free = true;
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const q = idx(fx + k, fz + j); if (q < 0 || surf[q] === -2147483648 || g.get(fx + k, surf[i] + 1, fz + j)) free = false; }
      if (!free) continue;
      const bud = R.chance(0.3), big = R.chance(0.4);
      lotus(g, [fx, surf[i] + 1, fz], { R, bud, size: big ? 'big' : 'small', stem: bud ? R.int(1, 3) : big ? R.int(1, 2) : 0 });
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const q = idx(fx + k, fz + j); if (q >= 0) occ[q] = 1; }
      break;
    }
  }
  return count;
}

// ---- pitcher plants -------------------------------------------------------------------------------------

/** Nepenthes cluster: squat mottled green/red pitchers with open dark mouths, red rims and lids, among strap leaves. opts: count (3–6), big (number of 3-wide pitchers, 1), radius (3), seed. */
export function pitcherPlant(g, p, o = {}) {
  const R = R_(o), mode = o.mode ?? 'keep';
  const [red, green, rim, inside, leaf] = mats(g, [o.pitcher ?? 'pitcher', o.green ?? 'pitcherGreen', o.rim ?? 'pitcherRim', o.inside ?? 'pitcherInside', o.leaf ?? 'pitcherLeaf']);
  const n = o.count ?? R.int(3, 6), nBig = Math.min(n, o.big ?? 1), rad = o.radius ?? 3;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const mott = (x, y, z, f) => (hash3(x, y, z, 91) < 0.2 + f * 0.45 ? red : green);
  const put = (x, y, z, m) => g.put(x, y, z, m, mode);
  const spots = [], y = p[1], a0 = R() * TAU;
  for (let i = 0, tries = 0; spots.length < n && tries < n * 6; tries++, i++) {
    const big = spots.length < nBig, a = a0 + (i / n) * TAU + R.range(-0.4, 0.4), d = big && !spots.length ? R.range(0, 1) : R.range(1.6, rad);
    const x = rnd(p[0] + Math.cos(a) * d), z = rnd(p[2] + Math.sin(a) * d);
    if (spots.some(([sx, sz, sb]) => Math.max(Math.abs(sx - x), Math.abs(sz - z)) < (big || sb ? 3 : 2))) continue;
    spots.push([x, z, big]);
    const [fx, fz] = R.pick(dirs), [qx, qz] = [fz, fx];   // lid at the back (−f), qx/qz across
    if (big) { // squat bulb, a square red peristome ring around the dark mouth, a lid raised at the back
      for (const [i2, j2] of [[0, 0], ...dirs]) put(x + i2, y, z + j2, green);
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) put(x + k, y + 1, z + j, j || k ? mott(x + k, y + 1, z + j, 0.5) : inside);
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) if (j || k) put(x + k, y + 2, z + j, rim);
      for (const k of [-1, 0, 1]) put(x - fx + qx * k, y + 3, z - fz + qz * k, k ? green : mott(x, y + 3, z, 0.5));
      put(x - fx, y + 4, z - fz, green);
    } else { // little pitcher: green foot, mottled body, red rim, lid tilted back
      const h = R.int(2, 3);
      for (let j = 0; j < h - 1; j++) put(x, y + j, z, j ? mott(x, y + j, z, 0.9) : green);
      put(x, y + h - 1, z, rim); put(x - fx, y + h, z - fz, green);
    }
  }
  // strap leaves radiating from the middle (between the pitchers)
  const nl = R.int(4, 6);
  for (let i = 0; i < nl; i++) {
    const a = a0 + ((i + 0.5) / nl) * TAU + R.range(-0.2, 0.2), L = R.range(2.5, 3.8);
    g.line([p[0], y, p[2]], [p[0] + Math.cos(a) * L, y + R.range(0, 0.6), p[2] + Math.sin(a) * L], leaf, { mode });
  }
  return g;
}

// ---- fallen log -----------------------------------------------------------------------------------------

/**
 * Mossy fallen log from a to b (both at standing level: the log rests on the ground y − 1). Hollow open end at b,
 * cut end-grain rings at a, bark grooves, moss on top, bracket fungi shelves on the sides, broken branch stubs,
 * small mushrooms and a fern growing on top (nurse log). opts: radius (1.5–2.5), taper (0.85), bury (0.25), hollow (true),
 * moss (0.45 coverage), fungi (count), mushrooms (count), stubs (count), ferns (count), log/dark/moss/mossLight/fungi, seed. → { top }
 */
export function fallenLog(g, a, b, o = {}) {
  const R = R_(o), mode = o.mode ?? 'replace';
  const [bark, barkD, cut, cutD, inner, mossA, mossB] = mats(g, [o.log ?? 'log', o.dark ?? 'logDark', 'logCut', 'logCutDark', 'logInside', o.moss ?? 'logMoss', o.mossLight ?? 'logMossLight']);
  const fungi = mats(g, o.fungi ?? ['fungusOrange', 'fungus']);
  const N = noise((o.seed ?? 1) * 13 + 5);
  const r0 = range(o.radius, R, 1.5, 2.5), r1 = r0 * (o.taper ?? 0.85), bury = o.bury ?? 0.25;
  const A = [a[0], a[1] + r0 * (1 - bury) - 0.5, a[2]], B = [b[0], b[1] + r1 * (1 - bury) - 0.5, b[2]];
  const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], len = Math.hypot(...d) || 1, u = d.map((v) => v / len);
  const hz = Math.hypot(u[0], u[2]) || 1, side = [-u[2] / hz, 0, u[0] / hz];
  const up = [u[1] * -u[0] / hz * 0, 1, 0];
  const hollowD = o.hollow === false ? 0 : Math.min(len * 0.4, R.range(2, 4));
  const rMax = Math.max(r0, r1) + 1;
  const lo = [0, 1, 2].map((k) => Math.floor(Math.min(A[k], B[k]) - rMax)), hi = [0, 1, 2].map((k) => Math.ceil(Math.max(A[k], B[k]) + rMax));
  const solid = new Map(), K = (x, y, z) => x + ',' + y + ',' + z;
  for (let y = Math.max(lo[1], a[1] - 2); y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
    const px = x - A[0], py = y - A[1], pz = z - A[2], tl = px * u[0] + py * u[1] + pz * u[2];
    if (tl < -0.5 || tl > len + 0.5) continue;
    const t = clamp(tl / len), qx = px - u[0] * tl, qy = py - u[1] * tl, qz = pz - u[2] * tl, dist = Math.hypot(qx, qy, qz);
    const ang = Math.atan2(qy, qx * side[0] + qz * side[2]);
    const r = r0 + (r1 - r0) * t + N.simplex2(tl * 0.3, ang * 1.2) * 0.15;
    if (dist > r) continue;
    const endA = tl < 0.5, endB = tl > len - 0.5, cav = hollowD && tl > len - hollowD && dist < r - 1.05;
    if (cav) continue;
    let m;
    if (endA && dist < r - 0.75) m = Math.floor(dist + 0.5) % 2 ? cutD : cut;              // end-grain rings
    else if (endB && hollowD && dist < r - 0.75) m = cut;                                  // rim of the hollow end
    else if (dist < r - 0.85 && tl > len - hollowD - 1) m = inner;                         // cavity wall / back
    else m = (Math.floor((ang / TAU) * 14 + N.simplex2(tl * 0.15, 3) * 1.5) & 3) === 0 ? barkD : bark; // grooves
    solid.set(K(x, y, z), { x, y, z, m, tl, ang, dist, r });
  }
  for (const c of solid.values()) g.put(c.x, c.y, c.z, c.m, mode);
  // moss on top faces (noise patches), cushions on the crest
  const mossCov = o.moss ?? 0.45;
  const tops = [];
  for (const c of solid.values()) {
    if (solid.has(K(c.x, c.y + 1, c.z)) || c.m === cut || c.m === cutD) continue;
    const n = (N.simplex2(c.x * 0.3, c.z * 0.3) + 1) / 2;
    if (c.ang > 0.35 && n < mossCov + Math.sin(c.ang) * 0.3) { g.set(c.x, c.y, c.z, n < mossCov * 0.45 ? mossB : mossA); tops.push(c); }
  }
  for (const c of tops) if (hash3(c.x, c.y, c.z, 41) < 0.07 && c.ang > 1.2) g.put(c.x, c.y + 1, c.z, hash3(c.x, c.y, c.z, 42) < 0.5 ? mossB : mossA, 'keep');
  const surfAt = (t, s, h) => { // point just outside the bark at axis fraction t, side s, height factor h (−1..1)
    const r = r0 + (r1 - r0) * t, c = [A[0] + d[0] * t, A[1] + d[1] * t, A[2] + d[2] * t];
    return [c[0] + side[0] * s * (r + 0.6) * Math.sqrt(1 - h * h * 0.5), c[1] + h * r, c[2] + side[2] * s * (r + 0.6) * Math.sqrt(1 - h * h * 0.5)];
  };
  // bracket fungi: flat shelves in tiers stuck to the sides (found by walking out from the axis to the bark)
  const nf = o.fungi ?? R.int(2, 4), ax = Math.abs(u[0]) > Math.abs(u[2]) ? [1, 0] : [0, 1];
  const sideOut = [Math.abs(side[0]) > Math.abs(side[2]) ? Math.sign(side[0]) : 0, Math.abs(side[0]) > Math.abs(side[2]) ? 0 : Math.sign(side[2])];
  for (let i = 0; i < nf; i++) {
    const t = R.range(0.12, 0.85), sg = R.sign(), m = R.pick(fungi), w = R.int(2, 3), tiers = R.int(1, 3);
    const c = [A[0] + d[0] * t, A[1] + d[1] * t, A[2] + d[2] * t];
    for (let tier = 0; tier < tiers; tier++) {
      const yy = rnd(c[1] + R.range(-0.2, 0.6) * r0) - tier * 2;
      for (let k = 0; k < w - tier; k++) {
        const bx = rnd(c[0]) + ax[0] * (k + tier), bz = rnd(c[2]) + ax[1] * (k + tier);
        let x = bx, z = bz, n = 0;
        while (g.get(x, yy, z) && n++ < 6) { x += sideOut[0] * sg; z += sideOut[1] * sg; }
        if (n > 0 && n < 6 && !g.get(x, yy, z)) g.set(x, yy, z, m);
      }
    }
  }
  // broken branch stubs on top/sides
  for (let i = 0, ns = o.stubs ?? R.int(1, 2); i < ns; i++) {
    const t = R.range(0.2, 0.7), s = R.sign(), q = surfAt(t, s, R.range(0.3, 0.8));
    const e = [q[0] + side[0] * s * R.range(0.8, 2) + u[0] * R.range(0, 1.5), q[1] + R.range(1.5, 3), q[2] + side[2] * s * R.range(0.8, 2) + u[2] * R.range(0, 1.5)];
    g.line(q, e, bark, { mode: 'keep' });
    g.put(rnd(e[0]), rnd(e[1]), rnd(e[2]), cutD, 'keep');
  }
  // small mushrooms on the ground along the log
  const mush = mats(g, ['fungus', 'fungusOrange']);
  for (let i = 0, nm = o.mushrooms ?? R.int(2, 4); i < nm; i++) {
    const t = R.range(0.1, 0.9), s = R.sign(), r = r0 + (r1 - r0) * t;
    const x = rnd(a[0] + (b[0] - a[0]) * t + side[0] * s * (r + R.range(0.6, 1.6))), z = rnd(a[2] + (b[2] - a[2]) * t + side[2] * s * (r + R.range(0.6, 1.6)));
    const y = rnd(a[1] + (b[1] - a[1]) * t);
    if (g.get(x, y, z) || !g.get(x, y - 1, z)) continue;
    g.put(x, y, z, mush[0], 'keep'); g.put(x, y + 1, z, mush[1], 'keep');
    if (R.chance(0.4)) { g.put(x + 1, y, z, mush[0], 'keep'); }
  }
  // a fern or two growing on the crest
  const crest = (t) => { const c = [A[0] + d[0] * t, A[1] + d[1] * t, A[2] + d[2] * t]; const x = rnd(c[0]), z = rnd(c[2]); let y = rnd(c[1] + r0 + 1); while (y > c[1] && !g.get(x, y - 1, z)) y--; return [x, y, z]; };
  for (let i = 0, nfn = o.ferns ?? R.int(0, 2); i < nfn; i++) fern(g, crest(R.range(0.25, 0.75)), { R, radius: R.range(1.6, 2.4), height: R.range(1.5, 2.5), fronds: R.int(5, 7) });
  return { top: crest(0.5) };
}

// ---- undergrowth (workhorse fill) -----------------------------------------------------------------------

/** Seedling / sapling: thin stem with a few leaves at the top. opts: height (2–4), leaves, stem, seed */
function seedling(g, p, o = {}) {
  const R = R_(o), mode = o.mode ?? 'keep';
  const sh = mats(g, o.leaves ?? ['fern', 'fernLight']), stem = g.mat(o.stem ?? 'alocasiaStem');
  const h = o.height ?? R.int(2, 4), [x, y, z] = p;
  for (let i = 0; i < h - 1; i++) g.put(x, y + i, z, stem, mode);
  const t = y + h - 1, dirs = R.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  g.put(x, t, z, sh[1], mode);
  for (let k = 0; k < R.int(2, 3); k++) g.put(x + dirs[k][0], t - (k === 2 ? 1 : 0), z + dirs[k][1], sh[k & 1], mode);
  return g;
}

/**
 * Lush understory fill on top of ground surfaces in [x0,z0]–[x1,z1]: patches of ferns and alocasia, rare heliconia
 * accents, seedlings, fern tufts, small flowers and mushrooms, clustered with noise and spaced so it reads calm.
 * opts: on (ground materials; default any non-foliage top), density (1 = default lushness), avoid ([[x0,z0],[x1,z1]] list
 * or (x,z) → bool), mix { fern, alocasia, heliconia, seedling, tuft, flower, mushroom, treeFern, pitcher }, scale (plant
 * size multiplier), seed. → { count, byType }
 */
export function undergrowth(g, a, b, o = {}) {
  const R = R_(o);
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[a.length - 1], b[b.length - 1]), z1 = Math.max(a[a.length - 1], b[b.length - 1]);
  const seed = o.seed ?? 1, N = noise(seed * 7 + 3), dens = o.density ?? 1, sc = o.scale ?? 1;
  const mix = { fern: 5, alocasia: 1.5, heliconia: 0.15, seedling: 1.5, tuft: 4, flower: 0.5, mushroom: 0.4, treeFern: 0, pitcher: 0, ...o.mix };
  const on = o.on ? new Set(mats(g, o.on)) : null;
  const avoid = typeof o.avoid === 'function' ? o.avoid : (x, z) => (o.avoid ?? []).some(([p, q]) => x >= Math.min(p[0], q[0]) && x <= Math.max(p[0], q[0]) && z >= Math.min(p[1], q[1]) && z <= Math.max(p[1], q[1]));
  const T = g.tops(x0, z0, x1, z1), W = T.W;
  const occ = new Uint8Array(T.y.length);
  const occAt = (x, z) => (x < x0 || x > x1 || z < z0 || z > z1 ? 0 : occ[x - x0 + (z - z0) * W]);
  const mark = (x, z, r) => { for (let j = -Math.ceil(r); j <= r; j++) for (let i = -Math.ceil(r); i <= r; i++) if (i * i + j * j <= r * r + 0.5) { const xx = x + i, zz = z + j; if (xx >= x0 && xx <= x1 && zz >= z0 && zz <= z1) occ[xx - x0 + (zz - z0) * W] = 1; } };
  const freeR = (x, z, r) => { for (let j = -Math.ceil(r); j <= r; j++) for (let i = -Math.ceil(r); i <= r; i++) if (i * i + j * j <= r * r + 0.5 && occAt(x + i, z + j)) return false; return true; };
  const ground = (x, z) => {
    const i = x - x0 + (z - z0) * W, ty = T.y[i];
    if (ty === -2147483648) return null;
    const id = T.id[i];
    if ((on ? on.has(id) : !isFoliage(g, id) && !isWater(g, id))) return ty;
    return groundBelow(g, x, z, ty - 1, on, ty - 120);
  };
  const BIG = { fern: 1, alocasia: 1, heliconia: 1, treeFern: 1, pitcher: 1 };
  const byType = {};
  const cell = 3;
  // pass 1: big plants on a jittered grid (patchy via noise), pass 2: small fill
  for (const pass of [0, 1]) {
    const types = Object.entries(mix).filter(([k, w]) => w > 0 && !!BIG[k] === !pass);
    if (!types.length) continue;
    const step = pass ? 2 : cell;
    for (let gz = z0; gz <= z1; gz += step) for (let gx = x0; gx <= x1; gx += step) {
      const h = hash3(gx, gz, pass, seed + 19);
      const x = Math.min(x1, gx + Math.floor(hash3(gx, gz, 1, seed + 20) * step)), z = Math.min(z1, gz + Math.floor(hash3(gx, gz, 2, seed + 21) * step));
      // lushness 0..1: dense patches separated by calm clearings; small things gather along the patch edges
      const f = (N.fbm2(x * 0.06, z * 0.06, { octaves: 2 }) + 1) / 2, patch = clamp((f - 0.36) / 0.28) ** 2 * (3 - 2 * clamp((f - 0.36) / 0.28));
      const edge = 1 - Math.abs(2 * patch - 1);
      const pr = pass ? 0.14 * dens * (0.15 + edge * 0.7 + patch * 0.3) : 0.3 * dens * patch;
      if (h >= pr || avoid(x, z) || occAt(x, z)) continue;
      const gy = ground(x, z);
      if (gy == null) continue;
      const kind = N.simplex2(x * 0.05 + 40, z * 0.05);            // fern patches vs alocasia stands
      const w = types.map(([k, wt]) => [k, wt * (k === 'fern' ? 1 + kind : k === 'alocasia' ? Math.max(0.15, 1 - kind * 1.5) : 1)]);
      const type = R.weighted(w), p = [x, gy + 1, z];
      const rr = { fern: 2.4 * sc, alocasia: 3.4 * sc, heliconia: 2.6 * sc, treeFern: 4 * sc, pitcher: 2 }[type] ?? 0;
      if (rr && !freeR(x, z, rr * 0.75)) continue;
      const S = rng(hash3(x, gy, z, seed) * 4294967296);
      switch (type) {
        case 'fern': fern(g, p, { R: S, radius: S.range(2, 3.2) * sc, fronds: S.int(5, 7) }); break;
        case 'alocasia': alocasia(g, p, { R: S, count: S.int(3, 5), height: S.range(3, 5) * sc, length: [3, 4.5 * sc] }); break;
        case 'heliconia': heliconia(g, p, { R: S, height: S.range(4, 5.5) * sc, count: S.int(3, 5), spikes: 1 }); break;
        case 'treeFern': treeFern(g, p, { R: S, height: S.int(5, 8) * sc }); break;
        case 'pitcher': pitcherPlant(g, p, { R: S, count: S.int(3, 4), big: 0 }); break;
        case 'seedling': seedling(g, p, { R: S }); break;
        case 'tuft': { const sh = mats(g, ['fernDark', 'fern', 'fernLight']), th = S.int(1, 2); for (let k = 0; k < th; k++) g.put(x, p[1] + k, z, sh[k + (S.chance(0.5) ? 1 : 0)], 'keep'); if (S.chance(0.5)) { const [i, j] = S.pick([[1, 0], [0, 1], [-1, 0], [0, -1]]); g.put(x + i, p[1], z + j, sh[1], 'keep'); } break; }
        case 'flower': { const fl = mats(g, ['orchidWhite', 'orchidWhite', 'heliconiaTip', 'heliconiaTip', 'orchid', 'heliconia']), c = S.pick(fl), st = mats(g, ['fernDark'])[0]; for (let k = 0; k < S.int(1, 3); k++) { const xx = x + (k ? S.int(-1, 1) : 0), zz = z + (k ? S.int(-1, 1) : 0); const hh = S.int(1, 2); for (let y = 0; y < hh; y++) g.put(xx, p[1] + y, zz, st, 'keep'); g.put(xx, p[1] + hh, zz, c, 'keep'); } break; }
        case 'mushroom': { const m = mats(g, ['fungus', 'fungusOrange']); g.put(x, p[1], z, m[0], 'keep'); g.put(x, p[1] + 1, z, m[S.chance(0.6) ? 1 : 0], 'keep'); if (S.chance(0.5)) { g.put(x + 1, p[1], z, m[0], 'keep'); } break; }
      }
      if (rr) mark(x, z, rr); else mark(x, z, 0.5);
      byType[type] = (byType[type] ?? 0) + 1;
    }
  }
  return { count: Object.values(byType).reduce((s, v) => s + v, 0), byType };
}

// ---- registration (every exported generator needs one; test.mjs checks) ----
const U_ = (fn, summary, example, meta = {}) => defineGenerator(fn, { category: 'understory', summary, example, ...meta });
U_(fern, 'ground fern rosette: arching fronds with pinnae', (g) => { fern(g, [0, 1, 0], { seed: 3, radius: 3.6 }); fern(g, [-6, 1, 5], { seed: 4 }); fern(g, [6, 1, -4], { seed: 5, radius: 2.4 }); });
U_(treeFern, 'tree fern: thin dark trunk, crown of long arching fronds', (g) => treeFern(g, [0, 1, 0], { seed: 3, height: 8 }));
U_(alocasia, 'giant elephant-ear leaves on stalks (pale midrib + veins)', (g) => alocasia(g, [0, 1, 0], { seed: 3, count: 5, height: 5.5 }));
U_(rafflesia, 'Rafflesia kerrii: giant red warty flower with central cup + buds', (g) => rafflesia(g, [0, 1, 0], { seed: 3, buds: 2 }));
U_(heliconia, 'lobster-claw heliconia: paddle leaves + red zig-zag bracts', (g) => { heliconia(g, [-3, 1, 0], { seed: 3, height: 6 }); heliconia(g, [4, 1, 2], { seed: 4, form: 'hanging', height: 5.5 }); });
U_(rattan, 'climbing rattan palm: spiny arching stems, feathery fronds, whips', (g) => { g.cylinder([-5, 1, -5], 1.5, 18, 'bark'); rattan(g, [3, 1, 3], { seed: 3, to: [-4, 14, -4], stems: 2 }); });
U_(liana, 'woody vine hanging between two points (sag, twist, loops, leaves)', (g) => { g.box([-9, 1, -2], [-8, 16, -1], 'bark'); g.box([8, 1, -2], [9, 13, -1], 'bark'); liana(g, [-7, 15, -1], [7, 12, -1], { seed: 3, sag: 0.35, loops: 1 }); liana(g, [-7, 11, -2], [-2, 1, 3], { seed: 4, coil: 3, thick: 3 }); });
U_(lianas, 'drape lianas from anchor points (branch tips) to the ground / each other', (g) => {
  g.cylinder([0, 1, 0], 1.5, 18, 'bark');
  const tips = [[-8, 17, -2], [7, 18, 3], [2, 16, -8], [-4, 15, 7]];
  for (const t of tips) g.line([0, 14, 0], t, 'bark', { r: 0.8, r2: 0.5 });
  lianas(g, tips, { seed: 3 });
});
U_(epiphytes, 'orchids, bromeliads, ferns and moss on branches + trunks', (g) => {
  g.cylinder([0, 1, 0], 1.5, 16, 'bark');
  g.line([0, 9, 0], [-9, 13, 2], 'bark', { r: 1.2, r2: 0.8 }); g.line([0, 12, 0], [8, 15, -4], 'bark', { r: 1.2, r2: 0.8 }); g.line([0, 6, 0], [6, 8, 7], 'bark', { r: 1, r2: 0.7 });
  epiphytes(g, { on: ['bark'], density: 0.35, seed: 3 });
});
U_(lilyPads, 'lily pads + lotus flowers floating on water', (g) => {
  g.box([-11, -3, -11], [11, 0, 11], 'stone'); g.box([-10, -2, -10], [10, 0, 10], 'water');
  lilyPads(g, [-10, -10], [10, 10], { seed: 3, coverage: 0.35 });
}, { ground: false });
U_(lotus, 'lotus flower / bud on a short stem', (g) => { g.box([-6, -2, -6], [6, 0, 6], 'water'); lotus(g, [0, 1, 0], { stem: 1 }); lotus(g, [3, 1, 2], { bud: true, stem: 2 }); lotus(g, [-3, 1, 2], { size: 'small', stem: 0 }); }, { ground: false });
U_(pitcherPlant, 'Nepenthes cluster: mottled pitchers with lids', (g) => { pitcherPlant(g, [0, 1, 0], { seed: 3, big: 1, count: 5 }); pitcherPlant(g, [6, 1, 4], { seed: 5 }); });
U_(fallenLog, 'mossy fallen log: hollow end, bracket fungi, stubs, mushrooms', (g) => fallenLog(g, [-9, 1, 0], [8, 1, 0], { seed: 3, radius: 2.2, ferns: 1 }));
U_(undergrowth, 'lush understory fill: fern/alocasia patches, seedlings, flowers', (g) => {
  g.box([-11, -2, -11], [11, -1, 11], 'dirt'); g.box([-11, 0, -11], [11, 0, 11], 'grass');
  undergrowth(g, [-11, -11], [11, 11], { seed: 3, density: 2.2, on: ['grass'] });
}, { ground: false });
