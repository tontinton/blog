// Limestone karst: sheer jungle-capped towers (Khao Sok, Ha Long Bay, Guilin), waterline notches, rain
// streaks, ledges; caves with stalactites/stalagmites. Same conventions as nature.js: fn(g, p, o),
// `seed`/`R`, material overrides.
//
//   const P = new Palette({ ...NATURE, ...JUNGLE, ...KARST });
//   const k = karst(g, [0, -6, 0], { height: 80, radius: 18, water: 0, leaves: ['jungleLeafDark', 'jungleLeaf', 'jungleLeafLight', 'jungleLeafSun'] });
//   cave(g, k.faces['+x'], { dir: '+x', glow: true });          // a cave mouth at the waterline
//   karstIslet(g, [30, -6, 10], { water: 0 });                    // small rock islet with one clinging tree
//
// How a tower is built (cheap to mesh, crafted up close): the mesher only merges faces whose corner AO is
// uniform, so every concave step of an outline costs one quad *per layer* (a voxel cylinder r=20 h=80 is ~8k
// quads). Each "lobe" (summit) is therefore a union of a few axis-aligned rectangles (few concave corners, big
// flat faces) plus buttress sub-pillars, constant inside horizontal bands 3–8 tall; walls step in (ledges) /
// out (overhangs) only at band boundaries, mostly a whole side at once; vertical grooves, ledge features
// (terraces, alcoves) and a lopsided rounded cap on top. Hollow: the inside is a plus-shaped rectangular
// cavity ≥ 4 voxels in. Rock colour detail is material-side (noise/jitter) plus painted vertical rain streaks.
import { rng, noise, hash3, clamp } from '../random.js';
import { defineGenerator } from '../registry.js';
import { foliage } from './nature.js';

/** Default materials for the karst generators. Spread into your palette and override freely. */
export const KARST = {
  limestone: { color: '#c9c4b7', jitter: 0.05, noise: { color: '#a9a396', scale: 0.09, amount: 0.75 } },
  limestoneLight: { color: '#e0dace', jitter: 0.04 },
  limestoneDark: { color: '#7c7b6b', jitter: 0.05, noise: { color: '#5c6352', scale: 0.15, amount: 0.6 } },   // under water
  limestoneStreak: { color: '#3c3a37', jitter: 0.07, noise: { color: '#5a5650', scale: 0.25, amount: 0.6 } }, // black rain streaks
  limestoneOrange: { color: '#b4805a', jitter: 0.06, noise: { color: '#946446', scale: 0.3, amount: 0.6 } },  // iron-orange streaks
  limestoneNotch: { color: '#6e685b', jitter: 0.05, noise: { color: '#5a5e4c', scale: 0.2, amount: 0.6 } },  // wet undercut at the waterline
  karstMoss: { color: '#5e7f34', jitter: 0.07, noise: { color: '#4a6a2c', scale: 0.2, amount: 0.7 } },       // green on ledge tops
  caveRock: { color: '#6a6058', jitter: 0.06, noise: { color: '#5a5048', scale: 0.2, amount: 0.6 } },
  caveDark: { color: '#3a3430', jitter: 0.05 },
  stalactite: { color: '#d8cfbc', jitter: 0.04 },
  caveGlow: { color: '#8ae0ff', emissive: 2.5, light: { color: '#6ad0ff', radius: 6, intensity: 0.6 } }, // glow-worms
};

const list = (m) => (Array.isArray(m) ? m : [m]);
const R_ = (o) => o.R ?? rng(o.seed ?? 1);
const TAU = Math.PI * 2;
const SIDES = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const LEAVES = ['leafDark', 'leaf', 'leafLight'];
const dead = (n, k) => (Math.abs(n) < k ? 0 : (n - Math.sign(n) * k) / (1 - k)); // dead-zone: most of the outline stays put
const amountOf = (v, d) => (v === false ? 0 : v === true || v == null ? d : v);
// rock codes (painted per cell, mapped to materials when writing)
const ROCK = 0, LIGHT = 1, DARK = 2, STREAK = 3, ORANGE = 4, NOTCH = 5, MOSS = 6;

/** Chessboard distance of every solid cell of one mask layer to the nearest empty cell (boundary cell = 1).
 *  Chessboard (not euclidean) so erosions of the rectilinear outlines stay rectilinear (cheap to mesh). */
function dist2d(M, off, W, D, out) {
  const BIG = 1e6;
  for (let i = 0; i < W * D; i++) out[off + i] = M[off + i] ? BIG : 0;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = off + z * W + x;
    if (!out[i]) continue;
    out[i] = Math.min(out[i], (x > 0 ? out[i - 1] : 0) + 1, (z > 0 ? out[i - W] : 0) + 1, (x > 0 && z > 0 ? out[i - W - 1] : 0) + 1, (x < W - 1 && z > 0 ? out[i - W + 1] : 0) + 1);
  }
  for (let z = D - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {
    const i = off + z * W + x;
    if (!out[i]) continue;
    out[i] = Math.min(out[i], (x < W - 1 ? out[i + 1] : 0) + 1, (z < D - 1 ? out[i + W] : 0) + 1, (x < W - 1 && z < D - 1 ? out[i + W + 1] : 0) + 1, (x > 0 && z < D - 1 ? out[i + W - 1] : 0) + 1);
  }
}

/** Largest axis-aligned rectangle of 1s in a W×D mask → { area, x0, x1, z0, z1 } (local, inclusive). */
function largestRect(m, W, D) {
  const hgt = new Int32Array(W), st = new Int32Array(W + 1);
  let best = { area: 0, x0: 0, x1: -1, z0: 0, z1: -1 };
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) hgt[x] = m[z * W + x] ? hgt[x] + 1 : 0;
    let sp = 0;
    for (let x = 0; x <= W; x++) {
      const hx = x < W ? hgt[x] : 0;
      while (sp && hgt[st[sp - 1]] >= hx) {
        const hh = hgt[st[--sp]], left = sp ? st[sp - 1] + 1 : 0, area = hh * (x - left);
        if (area > best.area) best = { area, x0: left, x1: x - 1, z0: z - hh + 1, z1: z };
      }
      st[sp++] = x;
    }
  }
  return best;
}

/** Hollow-out region for one block: the largest rectangle of the eroded mask plus two cross arms (a plus shape:
 *  covers ~80% of a round interior with only ~12 inner corners). Writes 1s into `cav`. */
function cavityRects(I, W, D, cav) {
  cav.fill(0);
  const r = largestRect(I, W, D);
  if (r.area < 4) return;
  const fillR = (x0, z0, x1, z1) => { for (let z = z0; z <= z1; z++) cav.fill(1, z * W + x0, z * W + x1 + 1); };
  fillR(r.x0, r.z0, r.x1, r.z1);
  const row = (z, x0, x1) => { for (let x = x0; x <= x1; x++) if (!I[z * W + x]) return false; return true; };
  const col = (x, z0, z1) => { for (let z = z0; z <= z1; z++) if (!I[z * W + x]) return false; return true; };
  const tw = Math.floor((r.x1 - r.x0 + 1) / 3), td = Math.floor((r.z1 - r.z0 + 1) / 3);
  if (tw >= 1) { // arm along z through the middle third of x
    const a = r.x0 + tw, b = r.x1 - tw;
    let z0 = r.z0, z1 = r.z1;
    while (z0 > 0 && row(z0 - 1, a, b)) z0--;
    while (z1 < D - 1 && row(z1 + 1, a, b)) z1++;
    fillR(a, z0, b, z1);
  }
  if (td >= 1) { // arm along x through the middle third of z
    const a = r.z0 + td, b = r.z1 - td;
    let x0 = r.x0, x1 = r.x1;
    while (x0 > 0 && col(x0 - 1, a, b)) x0--;
    while (x1 < W - 1 && col(x1 + 1, a, b)) x1++;
    fillR(x0, a, x1, b);
  }
}

/**
 * One summit of a karst. Its cross-section is a union of n axis-aligned rectangles inscribed in the [rx, rz]
 * ellipse (a stepped, blocky outline with few concave corners → big merged faces), each side jittered. The
 * section is constant inside horizontal bands (3–8 tall); between bands sides shift a little (ledges /
 * overhangs). Ledge features recess one side for a height range; grooves are vertical runnels.
 */
function makeLobe(R, N, L) {
  const { rx, rz, h, kind } = L;
  const rm = (rx + rz) / 2, rough = L.rough ?? 1, so = R.range(0, 100);
  const capH = L.capH ?? (kind === 'dome' ? clamp(rm * 0.35, 2, h * 0.2) : clamp(rm * 0.9, 3, h * 0.35));
  const n = clamp(Math.round(2 + rm / 6), 2, 6), lob = 0.22 * rough;
  const rects = [];
  for (let k = 0; k < n; k++) {
    const phi = ((k + 0.5 + R.range(-0.15, 0.15)) / n) * (Math.PI / 2);
    const hx = rx * Math.cos(phi) * 1.07, hz = rz * Math.sin(phi) * 1.07;
    rects.push([hx * (1 + R.range(-lob, lob)), hx * (1 + R.range(-lob, lob)), hz * (1 + R.range(-lob, lob)), hz * (1 + R.range(-lob, lob))]); // +x -x +z -z
  }
  // buttresses: lower sub-pillars clustered around the main column (stepped shoulders, ledges on their tops)
  const buttresses = [];
  for (let i = o_(L.buttresses, rm >= 6 ? R.int(2, 4) : R.int(0, 1)), a0 = R() * TAU; i > 0; i--) {
    const a = a0 + i * 2.1 + R.range(-0.4, 0.4), d = R.range(0.45, 0.7);
    buttresses.push({ ox: Math.cos(a) * rx * d, oz: Math.sin(a) * rz * d, hx: rm * R.range(0.28, 0.5), hz: rm * R.range(0.28, 0.5), h: Math.round(h * R.range(0.25, 0.75)) });
  }
  let emax = 0;
  for (const e of rects) emax = Math.max(emax, ...e);
  for (const b of buttresses) emax = Math.max(emax, Math.abs(b.ox) + b.hx, Math.abs(b.oz) + b.hz);
  // bands: shorter on the upper half of domes so they read rounded
  const bandOf = new Int16Array(h + 1), starts = [];
  for (let y = 0, b = 0; y <= h; b++) {
    starts.push(y);
    const bh = kind === 'dome' && y > h * 0.45 ? R.int(2, 4) : R.int(3, 8);
    for (let k = 0; k < bh && y <= h; k++, y++) bandOf[y] = b;
  }
  starts.push(h + 1);
  // band shifts: mostly a whole side moves at once (a coherent overhang / ledge along that face), rarely one rectangle
  const amp = clamp(rm * 0.12, 0.6, 3) * rough;
  const delta = starts.map((_, b) => {
    const t = new Int8Array(n * 4);
    const side = [0, 1, 2, 3].map((s) => dead(N.simplex2(b * 0.45 + so, s * 3.7 - so), 0.42));
    for (let j = 0; j < n * 4; j++) t[j] = Math.round((side[j & 3] + dead(N.simplex2(b * 0.9 - so, j * 1.37 + so), 0.72)) * amp);
    return t;
  });
  const lean = L.lean ?? 0, la = L.leanA ?? 0;
  const lx = starts.map((y) => Math.round(Math.cos(la) * lean * h * Math.pow(Math.min(1, y / h), 1.6)));
  const lz = starts.map((y) => Math.round(Math.sin(la) * lean * h * Math.pow(Math.min(1, y / h), 1.6)));
  const capFloor = kind === 'dome' ? Math.round(h * 0.76) : Math.round(h - capH - 3);
  // ledge features: recess the outermost rectangle on one side (terrace: up to the top; alcove: a roofed recess)
  const feats = [];
  for (let i = 0; i < (L.ledges ?? 0); i++) {
    const s = R.int(0, 3), k = rects.reduce((bi, e, j) => (e[s] > rects[bi][s] ? j : bi), 0);
    const y0 = Math.round(h * R.range(0.18, 0.7)), terrace = R.chance(0.4);
    feats.push({ k, s, y0, y1: terrace ? h : y0 + R.int(4, 9), depth: R.int(2, clamp(Math.round(rm * 0.25), 2, 4)) });
  }
  // grooves: vertical runnels (1–2 wide) on the sides; the gully is a wide one for a waterfall
  const grooves = [];
  for (let i = o_(L.grooves, Math.round(rm / 5)); i > 0; i--) {
    const s = R.int(0, 3), across = s < 2 ? rz : rx;
    grooves.push({ s, pos: Math.round(R.range(-0.55, 0.45) * across), w: R.int(1, 2), d: rm > 12 && R.chance(0.4) ? 2 : 1, y0: R.int(0, Math.round(h * 0.3)), y1: R.int(Math.round(h * 0.5), capFloor) });
  }
  if (L.gully) {
    const s = { '+x': 0, '-x': 1, '+z': 2, '-z': 3 }[L.gully], w = L.gullyW + 2;
    grooves.push({ s, pos: -Math.floor(w / 2), w, d: 2, y0: 0, y1: h, gully: true });
  }
  const shoulder = L.shoulder ?? 1, flare = L.flare ?? 1;
  // vertical profile = wall (per band: taper, overhanging shoulder, flared foot) × cap (rounding near the top; each
  // rectangle side rounds at its own rate `c`, so the summit is lopsided instead of a ziggurat)
  const bandT = (yi) => { const b = bandOf[yi]; return (Math.min((starts[b] + starts[b + 1] - 1) / 2, h - 1) + 0.5) / h; };
  const wall = (yi) => {
    if (yi >= h || yi < 0) return 0;
    const t = bandT(yi);
    let r = kind === 'dome' ? 1 : 1 - 0.16 * t + 0.07 * shoulder * Math.exp(-(((t - 0.8) / 0.07) ** 2));
    if (t < 0.07) r += 0.05 * flare * (1 - t / 0.07);
    return r;
  };
  const capF = (yi, c) => {
    const dTop = h - 1 - yi;
    if (dTop < 0 || yi < 0) return 0;
    if (kind === 'dome') return Math.pow(Math.max(0, 1 - Math.pow(dTop < capH ? (yi + 0.5) / h : bandT(yi), 2.4 * c)), 0.5);
    const ch = capH * c;
    if (dTop >= ch) return 1;
    const k = 1 - (dTop + 0.7) / ch;
    return Math.sqrt(Math.max(0, 1 - k * k));
  };
  const ck = rects.map(() => [0, 1, 2, 3].map(() => R.range(0.55, 1.45)));
  const prof = (yi) => wall(yi) * capF(yi, 1);
  return { ...L, rm, capH, n, rects, ck, wall, capF, buttresses, emax, bandOf, starts, delta, amp, lx, lz, feats, grooves, prof, capFloor, top: h - 1 };
}
const o_ = (v, d) => (v == null ? d : v);

/** Small tree clinging to rock: bent 1-voxel trunk leaning out + a clumpy crown. Returns the crown center. */
function clingTree(g, root, out, o, R) {
  const h = o.h, lean = o.lean;
  const tip = [root[0] + out[0] * lean, root[1] + h, root[2] + out[1] * lean];
  const mid = [root[0] + out[0] * lean * 0.8, root[1] + h * 0.35, root[2] + out[1] * lean * 0.8];
  g.tube([root, mid, tip], o.trunk, { r: o.tr ?? 0.5, r2: 0.5, mode: 'keep' });
  const r = o.r, blobs = [{ c: [tip[0], tip[1] + r * 0.2, tip[2]], r }];
  for (let i = R.int(3, 4), a0 = R() * TAU; i > 0; i--) { const a = a0 + i * 1.7 + R.range(-0.3, 0.3); blobs.push({ c: [tip[0] + Math.cos(a) * r * 0.85, tip[1] + R.range(-0.25, 0.15) * r, tip[2] + Math.sin(a) * r * 0.85], r: r * R.range(0.55, 0.75) }); }
  foliage(g, blobs, { leaves: o.leaves, seed: R.int(0, 1e6), squash: 0.55, roughness: 0.3, speckle: 0.15, mode: 'keep' }); // umbrella crown
  return tip;
}

const shadeOf = (shades, t) => shades[clamp(Math.floor(t * shades.length), 0, shades.length - 1)];
/** Big-canopy foliage: same look as nature.foliage (noisy blob union, height-shaded, 'keep') but blobs are bucketed
 *  per 8×8 column tile so each cell only tests nearby blobs (a summit canopy has ~100 blobs). */
function canopyFill(g, blobs, o) {
  if (!blobs.length) return;
  const shades = o.leaves.map((m) => g.mat(m)), N = noise(o.seed ?? 7), freq = o.freq ?? 0.25, amp = o.roughness ?? 0.3, sq = o.squash ?? 0.8, sp = o.speckle ?? 0.14;
  let ylo = Infinity, yhi = -Infinity;
  const T = 8, tiles = new Map();
  for (const b of blobs) {
    ylo = Math.min(ylo, b.c[1] - b.r * sq - 1); yhi = Math.max(yhi, b.c[1] + b.r * sq + 1);
    for (let tz = Math.floor((b.c[2] - b.r - 1) / T); tz <= Math.floor((b.c[2] + b.r + 1) / T); tz++) for (let tx = Math.floor((b.c[0] - b.r - 1) / T); tx <= Math.floor((b.c[0] + b.r + 1) / T); tx++) {
      const k = tx * 65536 + tz;
      if (!tiles.has(k)) tiles.set(k, { tx, tz, bl: [] });
      tiles.get(k).bl.push(b);
    }
  }
  const span = Math.max(1, yhi - ylo), near = [], lim = (1 + amp) * (1 + amp);
  for (const { tx, tz, bl } of tiles.values()) {
    let ya = Infinity, yb = -Infinity;
    for (const b of bl) { ya = Math.min(ya, Math.floor(b.c[1] - b.r * sq - 1)); yb = Math.max(yb, Math.ceil(b.c[1] + b.r * sq + 1)); }
    for (let z = tz * T; z < tz * T + T; z++) for (let x = tx * T; x < tx * T + T; x++) {
      near.length = 0;
      for (const b of bl) if (Math.abs(x - b.c[0]) <= b.r * (1 + amp) + 1 && Math.abs(z - b.c[2]) <= b.r * (1 + amp) + 1) near.push(b);
      if (!near.length) continue;
      let ca = Infinity, cb = -Infinity;
      for (const b of near) { const e = b.r * sq * (1 + amp); ca = Math.min(ca, Math.floor(b.c[1] - e)); cb = Math.max(cb, Math.ceil(b.c[1] + e)); }
      for (let y = Math.max(ya, ca); y <= Math.min(yb, cb); y++) {
        let d = Infinity;
        for (const b of near) { const dx = (x - b.c[0]) / b.r, dy = (y - b.c[1]) / (b.r * sq), dz = (z - b.c[2]) / b.r; d = Math.min(d, dx * dx + dy * dy + dz * dz); }
        if (d > lim || g.get(x, y, z)) continue;
        d = Math.sqrt(d);
        const n = N.simplex3(x * freq, y * freq, z * freq);
        if (d + n * amp > 1) continue;
        const t = clamp(((y - ylo) / span) * 0.75 + (1 - d) * 0.15 + n * 0.25 + (hash3(x, y, z, 5) - 0.5) * sp + (o.bias ?? 0));
        g.set(x, y, z, shadeOf(shades, t));
      }
    }
  }
}

/**
 * Limestone karst tower / massif rising from `base` = [x, y, z] (its foot: ground or lake bed).
 * opts: height (60; 40–110), radius (number | [rx, rz]; ~height*0.22), profile 'tower' | 'dome' | 'massif', peaks (1–4),
 *       lean (0..0.3 of height), leanAngle (deg), water (lake surface y → waterline notch), notch (depth 3 | false),
 *       fillWater (material to fill notch cells ≤ water), streaks (amount 1), ledges (count ~height/16), shrubs (ledge plant amount 1),
 *       trees (cliff trees ~height/22), cap (true | 'sparse' | false), gardens (leaf clumps on the upper cliffs, amount 1),
 *       leaves (shades dark→light), trunk ('bark'), vines (amount 1), buttresses (count), grooves (count),
 *       hollow (true), shell (4), roughness (1), waterfall ('+x'|… gully + returned sheet spec), waterfallWidth (3),
 *       materials: rock, rockLight, rockDark, streak, orange, notchRock, moss; mode (rock write mode), seed
 * → { top, summits, crown, ledges, faces: { '+x': [x,y,z], … } (rock face cells at the waterline/foot — cave mouths),
 *     notch: [y0, y1] | null, waterfall: { top, bottomY, axis, width } | null, bounds: [[x0,y0,z0], [x1,y1,z1]] }
 */
export function karst(g, base, o = {}) {
  const R = R_(o), seed = R.int(0, 1e6), N = noise(seed);
  const bx = Math.round(base[0]), by = Math.round(base[1]), bz = Math.round(base[2]);
  const H = Math.max(6, Math.round(o.height ?? 60));
  const r0 = clamp(Math.round(H * 0.22), 4, 22);
  const RX = Math.max(2.5, Array.isArray(o.radius) ? o.radius[0] : o.radius ?? r0), RZ = Math.max(2.5, Array.isArray(o.radius) ? o.radius[1] ?? o.radius[0] : o.radius ?? r0);
  const peaks = clamp(Math.round(o.peaks ?? (o.profile === 'massif' ? 3 : 1)), 1, 6);
  const profile = o.profile ?? (peaks > 1 ? 'massif' : 'tower');
  const water = o.water ?? null;
  const leaves = list(o.leaves ?? LEAVES), vineShades = (leaves.length > 2 ? leaves.slice(0, leaves.length - 1) : leaves).map((m) => g.mat(m));
  const trunk = o.trunk ?? 'bark';
  const vinesAmt = amountOf(o.vines, 1), streakAmt = amountOf(o.streaks, 1), shrubAmt = amountOf(o.shrubs, 1);
  const lean = o.lean ?? R.range(0, 0.06), leanA = o.leanAngle != null ? (o.leanAngle * Math.PI) / 180 : R() * TAU;
  const nLedges = o.ledges ?? Math.round(H / 16), gw = o.waterfallWidth ?? 3;
  const cap = o.cap ?? true;

  // ---- lobes (summits) ----
  const lobes = [];
  const mk = (cx, cz, rx, rz, h, kind, extra = {}) => lobes.push(makeLobe(R, N, { cx, cz, rx, rz, h: Math.max(4, h), kind, lean, leanA, rough: o.roughness, buttresses: o.buttresses, grooves: o.grooves, ...extra }));
  if (profile === 'massif') {
    mk(0, 0, RX, RZ, Math.round(H * R.range(0.4, 0.55)), 'tower', { capH: Math.min(RX, RZ) * 0.5, shoulder: 0.4, ledges: Math.ceil(nLedges / 2), lean: lean * 0.3, gully: o.waterfall, gullyW: gw });
    const alongX = RX >= RZ, A = alongX ? RX : RZ, B = alongX ? RZ : RX, main = R.int(0, peaks - 1);
    for (let i = 0; i < peaks; i++) {
      const u = peaks === 1 ? 0 : ((i / (peaks - 1)) - 0.5) * 1.1 * A + R.range(-0.08, 0.08) * A, v = R.range(-0.3, 0.3) * B;
      const r = Math.max(3, Math.min(A * R.range(0.32, 0.45), B * R.range(0.5, 0.65)));
      mk(alongX ? u : v, alongX ? v : u, r * R.range(0.9, 1.1), r * R.range(0.9, 1.1), i === main ? H : Math.round(H * R.range(0.6, 0.85)), R.chance(0.55) ? 'tower' : 'dome', { ledges: Math.max(1, Math.round(nLedges / peaks)) });
    }
  } else {
    mk(0, 0, RX, RZ, H, profile, { ledges: nLedges, gully: o.waterfall, gullyW: gw });
    for (let i = 1; i < peaks; i++) {
      const a = R() * TAU, d = R.range(0.45, 0.6), s = R.range(0.45, 0.6);
      mk(Math.cos(a) * RX * d, Math.sin(a) * RZ * d, RX * s, RZ * s, Math.round(H * R.range(0.55, 0.8)), R.chance(0.5) ? 'tower' : 'dome', { ledges: 1 });
    }
  }

  // ---- 1. occupancy masks, one layer per y, in a local box: union of each lobe's rectangles, then grooves ----
  let ex = 0, ez = 0, Ly = 0;
  for (const lb of lobes) {
    const m = lb.emax * 1.1 + lb.amp + 4 + Math.abs(lb.lean) * lb.h;
    ex = Math.max(ex, Math.abs(lb.cx) + m); ez = Math.max(ez, Math.abs(lb.cz) + m); Ly = Math.max(Ly, lb.h);
  }
  const x0 = bx - Math.ceil(ex) - 2, x1 = bx + Math.ceil(ex) + 2, z0 = bz - Math.ceil(ez) - 2, z1 = bz + Math.ceil(ez) + 2;
  const y0 = by, y1 = by + Ly - 1, Wd = x1 - x0 + 1, Dd = z1 - z0 + 1, A = Wd * Dd;
  const idx = (x, yi, z) => yi * A + (z - z0) * Wd + (x - x0);
  const M = new Uint8Array(A * Ly);
  const ext = [0, 0, 0, 0];
  for (let yi = 0; yi < Ly; yi++) {
    for (const lb of lobes) {
      const p = lb.prof(yi);
      if (p <= 0) continue;
      const b = lb.bandOf[yi], dl = lb.delta[b], cx = bx + lb.cx + lb.lx[b], cz = bz + lb.cz + lb.lz[b];
      const k = Math.min(1, (p * lb.rm) / 6), wl = lb.wall(yi); // band shifts fade out where the cap gets small
      for (let r = 0; r < lb.n; r++) {
        for (let s = 0; s < 4; s++) {
          let v = lb.rects[r][s] * wl * lb.capF(yi, lb.ck[r][s]) + dl[r * 4 + s] * k;
          for (const f of lb.feats) if (f.k === r && f.s === s && yi >= f.y0 && yi <= f.y1) v -= f.depth;
          ext[s] = v;
        }
        const xa = clamp(Math.round(cx - ext[1]), x0 + 1, x1 - 1), xb = clamp(Math.round(cx + ext[0]), x0 + 1, x1 - 1);
        const za = clamp(Math.round(cz - ext[3]), z0 + 1, z1 - 1), zb = clamp(Math.round(cz + ext[2]), z0 + 1, z1 - 1);
        for (let z = za; z <= zb && xa <= xb; z++) M.fill(1, idx(xa, yi, z), idx(xb, yi, z) + 1);
      }
      for (const bt of lb.buttresses) {
        if (yi >= bt.h) continue;
        const sh = Math.max(0, yi - (bt.h - 4)) + (yi < lb.h * 0.07 ? -1 : 0); // rounded top, flared foot
        const xa = clamp(Math.round(cx + bt.ox - bt.hx + sh), x0 + 1, x1 - 1), xb = clamp(Math.round(cx + bt.ox + bt.hx - sh), x0 + 1, x1 - 1);
        const za = clamp(Math.round(cz + bt.oz - bt.hz + sh), z0 + 1, z1 - 1), zb = clamp(Math.round(cz + bt.oz + bt.hz - sh), z0 + 1, z1 - 1);
        for (let z = za; z <= zb && xa <= xb; z++) M.fill(1, idx(xa, yi, z), idx(xb, yi, z) + 1);
      }
    }
    for (const lb of lobes) { // vertical grooves / the waterfall gully: notch the outermost cells of a few rows
      const p = lb.prof(yi);
      if (p <= 0 || !lb.grooves.length) continue;
      const b = lb.bandOf[yi], cx = Math.round(bx + lb.cx + lb.lx[b]), cz = Math.round(bz + lb.cz + lb.lz[b]);
      for (const gr of lb.grooves) {
        if (yi < gr.y0 || yi > gr.y1) continue;
        const [dx, dz] = D4[gr.s];
        for (let j = 0; j < gr.w; j++) {
          let x = dx ? (dx > 0 ? x1 - 1 : x0 + 1) : cx + gr.pos + j, z = dz ? (dz > 0 ? z1 - 1 : z0 + 1) : cz + gr.pos + j;
          if (x <= x0 || x >= x1 || z <= z0 || z >= z1) continue;
          while ((x !== cx || !dx) && (z !== cz || !dz) && !M[idx(x, yi, z)]) { x -= dx; z -= dz; }
          if ((x - cx) * dx + (z - cz) * dz < (gr.gully ? 1 : lb.emax * p * 0.4)) continue; // not this lobe's outer face
          for (let d = 0; d < gr.d; d++) M[idx(x - dx * d, yi, z - dz * d)] = 0;
        }
      }
    }
  }

  // ---- 2. waterline notch (erode the layers around the water surface) ----
  const dist = new Float32Array(A * Ly);
  let notch = null;
  const notchCells = [];
  const notchD = water == null || o.notch === false ? 0 : o.notch ?? 3;
  if (notchD > 0 && water + 4 >= y0 && water - 1 <= y1 - 5) {
    const dep = [notchD - 1, notchD, notchD, notchD, notchD - 1, notchD - 2];
    for (let k = -1; k <= 4; k++) {
      const yi = water + k - y0;
      if (yi < 0 || yi >= Ly) continue;
      dist2d(M, yi * A, Wd, Dd, dist);
      let maxd = 0;
      for (let i = 0; i < A; i++) maxd = Math.max(maxd, dist[yi * A + i]);
      const lim = Math.max(0, maxd - 2.5); // never cut a thin islet through
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const i = yi * A + (z - z0) * Wd + (x - x0), d = dist[i];
        if (d && d <= Math.min(lim, Math.max(1, dep[k + 1] + Math.round(N.simplex2(x * 0.07, z * 0.07) * 0.8)))) { M[i] = 0; notchCells.push([x, water + k, z]); }
      }
    }
    notch = [water - 1, water + 4];
  }
  for (let yi = 0; yi < Ly; yi++) dist2d(M, yi * A, Wd, Dd, dist);
  const solid = (x, yi, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1 && yi >= 0 && yi < Ly && M[idx(x, yi, z)] === 1;

  // waterfall gully: where the sheet goes, and a keep-out box for plants
  let fall = null, keepOut = () => false;
  if (o.waterfall && SIDES[o.waterfall]) {
    const lb = lobes[0], [dx, dz] = SIDES[o.waterfall];
    const lipYi = clamp(Math.round(lb.h - lb.capH - 2), 2, Ly - 1), b = lb.bandOf[lipYi];
    const cx = Math.round(bx + lb.cx + lb.lx[b]), cz = Math.round(bz + lb.cz + lb.lz[b]);
    let fx = cx, fz = cz;
    for (let s = 0; s < Math.max(Wd, Dd); s++) { const x = cx + dx * s, z = cz + dz * s; if (solid(x, lipYi, z)) { fx = x; fz = z; } }
    const alongX = dx === 0, h0 = Math.floor(gw / 2);
    const top = alongX ? [fx - h0, y0 + lipYi, fz + dz] : [fx + dx, y0 + lipYi, fz - h0];
    fall = { top, bottomY: water ?? by, axis: alongX ? 'x' : 'z', width: gw };
    const m = h0 + 4;
    keepOut = (x, z) => (alongX ? Math.abs(x - fx) <= m && (z - fz) * dz >= -3 && (z - fz) * dz <= 6 : Math.abs(z - fz) <= m && (x - fx) * dx >= -3 && (x - fx) * dx <= 6);
  }

  // surface cells (solid with an empty 6-neighbour; the base layer counts as grounded): every painting / planting pass
  // below walks this list instead of the whole box
  const surf = [];
  for (let yi = 0; yi < Ly; yi++) for (let z = z0 + 1; z < z1; z++) for (let x = x0 + 1, i = idx(x, yi, z); x < x1; x++, i++) {
    if (M[i] && !(M[i - 1] && M[i + 1] && M[i - Wd] && M[i + Wd] && yi + 1 < Ly && M[i + A] && (yi === 0 || M[i - A]))) surf.push(i);
  }
  const XI = (i) => x0 + (i % Wd), ZI = (i) => z0 + (((i % A) / Wd) | 0), YI = (i) => (i / A) | 0;

  // ---- 3. paint codes: tops (moss/light), underwater, notch, rain streaks ----
  const C = new Uint8Array(A * Ly);
  for (const i of surf) {
    const x = XI(i), yi = YI(i), z = ZI(i);
    const y = y0 + yi, up = yi + 1 >= Ly || !M[i + A], side = !M[i - 1] || !M[i + 1] || !M[i - Wd] || !M[i + Wd];
    if (up) C[i] = !side || N.simplex3(x * 0.13, y * 0.13, z * 0.13) > 0.35 ? MOSS : LIGHT; // shelves green, step edges pale
    else if (side && water != null && y < water - 1) C[i] = DARK;
  }
  if (notch) for (let y = notch[0] - 1; y <= notch[1] + 1; y++) {
    const yi = y - y0;
    if (yi < 0 || yi >= Ly) continue;
    for (let z = z0 + 1; z < z1; z++) for (let x = x0 + 1; x < x1; x++) {
      const i = idx(x, yi, z);
      if (!M[i]) continue;
      const side = !M[i - 1] || !M[i + 1] || !M[i - Wd] || !M[i + Wd];
      const roof = y === notch[1] + 1, under = yi > 0 && !M[i - A];
      if ((y <= notch[1] && side) || (roof && under) || (roof && side && hash3(x, y, z, seed) < 0.5) || (y === notch[0] - 1 && C[i] === MOSS)) C[i] = NOTCH;
    }
  }
  if (streakAmt > 0) {
    const sources = [];
    const minYi = Math.max(2, notch ? notch[1] + 2 - y0 : 2);
    for (const i of surf) {
      const x = XI(i), yi = YI(i), z = ZI(i);
      if (yi < minYi) continue;
      for (const [dx, dz] of D4) {
        if (M[i + dx + dz * Wd]) continue; // not a face in this direction
        const rim = !solid(x, yi + 1, z) && solid(x, yi - 4, z) && !solid(x + dx, yi - 1, z + dz) && !solid(x + dx, yi - 4, z + dz);
        const over = solid(x + dx, yi + 1, z + dz);
        const p = (rim ? 0.07 : over ? 0.06 : 0) * streakAmt;
        if (p && hash3(x * 4 + dx + 7, yi, z * 4 + dz, seed + 1) < p) sources.push([x, yi - (rim ? 1 : 0), z, dx, dz, over ? 2 : 1]);
      }
    }
    const face = (x, yi, z, dx, dz) => { // nearest face cell along the normal from (x, z)
      for (const j of [0, -1, 1, -2, 2]) { const fx = x + dx * j, fz = z + dz * j; if (solid(fx, yi, fz) && !solid(fx + dx, yi, fz + dz)) return [fx, fz]; }
      return null;
    };
    for (const [sx, syi, sz, dx, dz, kind] of sources) {
      const w = R.weighted([[1, 4], [2, 4], [3, 2], [4, 1]]), tx = -dz, tz = dx;
      const len = Math.round(R.range(8, 16 + 40 * Math.min(2, streakAmt)));
      const allOrange = R.chance(0.08), orangeTop = kind === 2 && R.chance(0.6) ? R.int(2, 5) : 0;
      for (let k = 0; k < w; k++) {
        let x = sx + tx * (k - (w >> 1)), z = sz + tz * (k - (w >> 1));
        const L = Math.round(len * R.range(0.55, 1));
        for (let s = 0; s < L; s++) {
          const yi = syi - s;
          if (yi < 0) break;
          const f = face(x, yi, z, dx, dz);
          if (!f) break;
          [x, z] = f;
          const i = idx(x, yi, z);
          if (C[i] === NOTCH) break;
          if (C[i] === MOSS && s > 0) continue; // a little step: water runs over it
          C[i] = allOrange || s < orangeTop ? ORANGE : STREAK;
        }
      }
    }
  }

  // ---- 4. write the rock (hollow: the cavity is a plus of rectangles inside the ≥ shell-deep core, constant per
  // 8-layer block, so its inner walls have few corners and mesh cheaply) ----
  const mats = [o.rock ?? 'limestone', o.rockLight ?? 'limestoneLight', o.rockDark ?? 'limestoneDark', o.streak ?? 'limestoneStreak', o.orange ?? 'limestoneOrange', o.notchRock ?? 'limestoneNotch', o.moss ?? 'karstMoss'].map((m) => g.mat(m));
  const shell = o.shell ?? 4, BH = 8, hollow = o.hollow ?? true;
  const cavMin = Math.max(shell, water != null ? water + shell + 1 - y0 : 0);
  const cav = new Uint8Array(A), I = new Uint8Array(A);
  let cavBlock = -1;
  for (let yi = 0; yi < Ly; yi++) {
    let useCav = false;
    if (hollow && yi >= cavMin) {
      const blk = Math.floor((yi - cavMin) / BH);
      if (blk !== cavBlock) {
        cavBlock = blk;
        const b0 = cavMin + blk * BH, b1 = b0 + BH - 1;
        I.fill(1);
        for (let yy = b0 - shell; yy <= b1 + shell; yy++) {
          if (yy >= Ly) { I.fill(0); break; }
          const off = yy * A;
          for (let i = 0; i < A; i++) if (I[i] && dist[off + i] <= shell) I[i] = 0;
        }
        cavityRects(I, Wd, Dd, cav);
      }
      useCav = true;
    }
    const y = y0 + yi;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const j = (z - z0) * Wd + (x - x0), i = yi * A + j;
      if (!M[i] || (useCav && cav[j])) continue;
      if (o.mode) g.put(x, y, z, mats[C[i]], o.mode); else g.set(x, y, z, mats[C[i]]);
    }
  }
  if (o.fillWater) { const wm = g.mat(o.fillWater); for (const [x, y, z] of notchCells) if (y <= water && !g.get(x, y, z)) g.set(x, y, z, wm); }

  // ---- 5. plants: vine curtains, summit jungle, ledge shrubs + trees, trees sticking out of the cliffs ----
  const colTop = new Int16Array(A).fill(-1);
  for (const i of surf) { const j = i % A, yi = YI(i); if (yi > colTop[j]) colTop[j] = yi; } // a column's top cell is always a surface cell
  const owner = (x, yi, z) => { // lobe whose outline best contains this cell
    let best = -1, bv = Infinity;
    lobes.forEach((lb, n) => {
      if (yi >= lb.h) return;
      const b = lb.bandOf[yi], p = lb.prof(yi);
      if (p <= 0) return;
      const v = Math.hypot((x - bx - lb.cx - lb.lx[b]) / lb.rx, (z - bz - lb.cz - lb.lz[b]) / lb.rz) / p;
      if (v < bv) { bv = v; best = n; }
    });
    return best;
  };
  const minPlantYi = Math.max(2, notch ? notch[1] + 2 - y0 : 2);
  if (vinesAmt > 0) {
    const thr = 0.72 - 0.25 * Math.min(1.5, vinesAmt), minYi = water != null ? water + 2 - y0 : 1;
    for (const i of surf) {
      const x = XI(i), yi = YI(i), z = ZI(i);
      if (yi < minPlantYi || (yi + 1 < Ly && M[i + A])) continue; // rim cells: solid with air above
      for (const [dx, dz] of D4) {
        const fx = x + dx, fz = z + dz, y = y0 + yi;
        if (M[i + dx + dz * Wd] || solid(fx, yi - 1, fz) || keepOut(fx, fz)) continue;
        const cn = N.simplex2(fx * 0.11 + yi * 0.05, fz * 0.11 - yi * 0.03), hh = hash3(fx, y, fz, seed + 3);
        let L = 0;
        if (cn > thr) L = Math.round((5 + 20 * vinesAmt) * Math.min(1, ((cn - thr) / (1 - thr)) * 2.2) * (0.35 + 0.65 * hh));
        else if (hh < 0.012 * vinesAmt) L = 2 + Math.floor(hh * 997) % 5;
        if (L < 1) continue;
        const shade = vineShades[Math.floor(hash3(fx, y, fz, seed + 4) * vineShades.length)];
        let free = 0;
        for (let k = 0; k < L; k++) {
          const yy = yi - k;
          if (yy < minYi || solid(fx, yy, fz)) break;
          if (!solid(x, yy, z) && ++free > 6) break;
          g.put(fx, y0 + yy, fz, shade, 'keep');
        }
      }
    }
  }
  // summit jungle
  const canopyCells = lobes.map(() => []);
  if (cap) {
    const sp = Math.min(RX, RZ) > 7 ? 4 : 3, blobs = lobes.map(() => []);
    for (let z = z0 + 1; z < z1; z++) for (let x = x0 + 1; x < x1; x++) {
      const j = (z - z0) * Wd + (x - x0), ty = colTop[j];
      if (ty < minPlantYi) continue;
      const n = owner(x, ty, z);
      if (n < 0 || ty < lobes[n].capFloor) continue;
      canopyCells[n].push([x, ty, z]);
      if (cap === 'sparse' || keepOut(x, z)) continue;
      if (((x - x0) % sp) || ((z - z0) % sp)) continue; // jittered grid
      const jx = x + Math.floor(hash3(x, 7, z, seed) * sp), jz = z + Math.floor(hash3(x, 9, z, seed) * sp);
      const jj = (jz - z0) * Wd + (jx - x0), jt = jj >= 0 && jj < A ? colTop[jj] : -1;
      if (jt < minPlantYi || jx >= x1 || jz >= z1) continue;
      const rim = dist[clamp(lobes[n].capFloor, 0, Ly - 1) * A + jj] <= 3; // near the cliff edge (measured at the cap's foot)
      blobs[n].push({ c: [jx, y0 + jt + (rim ? R.range(-0.5, 1) : R.range(1.5, 3)), jz], r: rim ? R.range(2.8, 3.8) : R.range(3.5, 5) });
    }
    lobes.forEach((lb, n) => {
      const cells = canopyCells[n];
      if (!cells.length) return;
      if (cap === 'sparse') { // one tree on top + a shrub or two (islets)
        cells.sort((a, b) => b[1] - a[1] || hash3(a[0], a[1], a[2], seed) - hash3(b[0], b[1], b[2], seed));
        const t = cells[Math.min(cells.length - 1, R.int(0, 2))], a = R() * TAU;
        clingTree(g, [t[0], y0 + t[1] + 1, t[2]], [Math.cos(a), Math.sin(a)], { h: R.int(2, Math.max(3, Math.round(lb.rm * 0.8))), lean: R.range(1, 2.5), r: R.range(2.6, 3.4) + lb.rm * 0.1, trunk, leaves }, R);
        for (let k = R.int(2, 3); k > 0; k--) { const c = R.pick(cells); foliage(g, [{ c: [c[0], y0 + c[1] + 1, c[2]], r: R.range(1.4, 2.4) }, { c: [c[0] + R.int(-1, 1), y0 + c[1] + 1, c[2] + R.int(-1, 1)], r: R.range(1.2, 1.8) }], { leaves, seed: R.int(0, 1e6), squash: 0.7, mode: 'keep' }); }
        return;
      }
      for (let e = R.int(1, 1 + Math.round(lb.rm / 7)); e > 0; e--) { // emergent crowns break the silhouette
        const c = R.pick(cells), r = R.range(4, 4 + lb.rm * 0.12), y = y0 + c[1];
        if (keepOut(c[0], c[2])) continue;
        g.line([c[0], y + 1, c[2]], [c[0], y + 2 + r * 0.6, c[2]], trunk, { r: 0.8 });
        blobs[n].push({ c: [c[0], y + 2 + r * 0.9, c[2]], r });
      }
      canopyFill(g, blobs[n], { leaves, seed: R.int(0, 1e6), squash: 0.8, roughness: 0.3, freq: 0.25, speckle: 0.14 });
    });
  }
  // hanging gardens: leafy clumps clinging to the upper cliffs (clustered, denser toward the summit) with dripping vines
  const gardenAmt = cap === true ? amountOf(o.gardens, 1) : 0;
  if (gardenAmt > 0) {
    const gb = [], drips = [];
    for (const i of surf) {
      const x = XI(i), yi = YI(i), z = ZI(i);
      if (yi < minPlantYi || (M[i - 1] && M[i + 1] && M[i - Wd] && M[i + Wd]) || hash3(x, yi, z, seed + 21) > 0.045 * gardenAmt) continue;
      for (const [dx, dz] of D4) {
        if (M[i + dx + dz * Wd] || keepOut(x + dx, z + dz)) continue;
        const n = owner(x, yi, z);
        if (n < 0) break;
        const lb = lobes[n], lo = lb.capFloor - Math.min(lb.h * 0.28, 24);
        if (lb.h < Ly * 0.75) break; // lower lobes of a massif stay mostly bare rock
        if (yi < lo || yi > lb.capFloor + 2) break;
        const f = (yi - lo) / Math.max(1, lb.capFloor - lo);
        if (N.simplex3(x * 0.09, yi * 0.06, z * 0.09) < 0.55 - 0.65 * f) break;
        const r = R.range(1.6, 2.6 + f);
        gb.push({ c: [x + dx * 1.3, y0 + yi, z + dz * 1.3], r });
        if (vinesAmt > 0 && R.chance(0.5)) drips.push([x + dx, yi - Math.ceil(r * 0.7), z + dz, x, z, R.int(3, 6 + Math.round(10 * vinesAmt))]);
        break;
      }
    }
    canopyFill(g, gb, { leaves, seed: R.int(0, 1e6), squash: 0.8, roughness: 0.35, freq: 0.3, speckle: 0.18, bias: -0.08 });
    for (const [fx, top, fz, bxx, bzz, L] of drips) {
      const shade = vineShades[Math.floor(hash3(fx, top, fz, seed + 5) * vineShades.length)];
      for (let k = 0; k < L && top - k >= minPlantYi; k++) { if (solid(fx, top - k, fz) || !solid(bxx, top - k, bzz)) break; g.put(fx, y0 + top - k, fz, shade, 'keep'); }
    }
  }
  // ledges: shelves of ≥ 2 up-facing cells below the summits → shrubs, small trees, anchors
  const ledges = [];
  {
    const best = new Map();
    for (const i of surf) {
      const x = XI(i), yi = YI(i), z = ZI(i);
      if (yi < minPlantYi || yi >= Ly - 1 || M[i + A] || keepOut(x, z)) continue;
      let wide = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (M[i + dx + dz * Wd] && !M[i + A + dx + dz * Wd]) wide++;
      if (wide < 4 || solid(x, yi + 2, z)) continue;
      const n = owner(x, yi, z);
      if (cap && n >= 0 && colTop[i - yi * A] === yi && yi >= lobes[n].capFloor) continue; // summit, not a ledge
      const key = `${Math.floor(x / 8)},${Math.floor(yi / 6)},${Math.floor(z / 8)}`, hv = hash3(x, yi, z, seed + 8) - wide * 0.05;
      const cur = best.get(key);
      if (!cur || hv < cur.hv) best.set(key, { x, yi, z, hv, wide });
    }
    const spots = [...best.values()].sort((a, b) => a.hv - b.hv);
    for (const s of spots) {
      const y = y0 + s.yi + 1;
      ledges.push([s.x, y, s.z]);
      if (shrubAmt <= 0 || hash3(s.x, y, s.z, seed + 9) > 0.55 * Math.min(1, shrubAmt)) continue;
      // outward direction: away from the owning lobe's axis
      const lb = lobes[Math.max(0, owner(s.x, s.yi, s.z))], b = lb.bandOf[Math.min(s.yi, lb.h)];
      const ox = s.x - (bx + lb.cx + lb.lx[b]), oz = s.z - (bz + lb.cz + lb.lz[b]), ol = Math.hypot(ox, oz) || 1;
      let head = 0;
      while (head < 12 && !solid(s.x, s.yi + 1 + head, s.z) && !solid(Math.round(s.x + (ox / ol) * 2), s.yi + 1 + head, Math.round(s.z + (oz / ol) * 2))) head++;
      if (head >= 8 && hash3(s.x, y, s.z, seed + 10) < 0.35 * shrubAmt) clingTree(g, [s.x, y, s.z], [ox / ol, oz / ol], { h: R.int(3, Math.min(7, head - 3)), lean: R.range(1, 3), r: R.range(2.2, 3.2), trunk, leaves }, R);
      else foliage(g, [{ c: [s.x, y, s.z], r: R.range(1.3, 2.3) }, { c: [s.x + R.int(-1, 1), y, s.z + R.int(-1, 1)], r: R.range(1, 1.8) }], { leaves, seed: R.int(0, 1e6), squash: 0.7, roughness: 0.3, mode: 'keep' });
    }
  }
  // trees growing out of the cliff faces
  const nTrees = o.trees ?? Math.round(H / 22);
  for (let t = 0, tries = 0; t < nTrees && tries < nTrees * 8; tries++) {
    const lb = R.pick(lobes), lo = Math.max(minPlantYi + 3, Math.round(lb.h * 0.25)), hi = lb.capFloor - 4;
    if (hi <= lo) continue;
    const yi = R.int(lo, hi), th = R() * TAU, b = lb.bandOf[yi];
    const cx = bx + lb.cx + lb.lx[b], cz = bz + lb.cz + lb.lz[b], c = Math.cos(th), s = Math.sin(th);
    let fx = null, fz = null;
    for (let r = 0; r < Math.max(lb.rx, lb.rz) * 1.6 + 4; r += 0.5) { const x = Math.round(cx + c * r), z = Math.round(cz + s * r); if (solid(x, yi, z)) { fx = x; fz = z; } }
    if (fx == null || keepOut(fx, fz)) continue;
    const out = Math.abs(c) > Math.abs(s) ? [Math.sign(c), 0] : [0, Math.sign(s)];
    if (solid(fx + out[0], yi, fz + out[1])) continue;
    const h = R.int(3, 5), lean = R.range(2.5, 4.5), r = R.range(2, 3.2);
    const tip = [fx + out[0] * lean, yi + h, fz + out[1] * lean];
    let clear = true;
    for (let k = -1; k <= 1 && clear; k++) if (solid(Math.round(tip[0] + out[0] * k), Math.round(tip[1] + k), Math.round(tip[2] + out[1] * k)) || solid(Math.round(tip[0]), Math.round(tip[1] + r), Math.round(tip[2]))) clear = false;
    if (!clear) continue;
    clingTree(g, [fx, y0 + yi, fz], out, { h, lean, r, trunk, leaves }, R);
    t++;
  }

  // ---- 6. anchors ----
  const summits = lobes.map((lb, n) => {
    let bestC = null;
    for (const c of canopyCells[n]) if (!bestC || c[1] > bestC[1]) bestC = c;
    if (!bestC) { const b = lb.bandOf[lb.top]; return [Math.round(bx + lb.cx + lb.lx[b]), y0 + lb.h, Math.round(bz + lb.cz + lb.lz[b])]; }
    return [bestC[0], y0 + bestC[1] + 1, bestC[2]];
  });
  const top = summits.reduce((a, b) => (b[1] > a[1] ? b : a));
  const crown = [top[0], g.top(top[0], top[2]) + 1, top[2]];
  const fy = clamp(water != null ? water + 1 : by + 1, y0, y1) - y0, faces = {};
  for (const [side, [dx, dz]] of Object.entries(SIDES)) {
    const lb = lobes[0], b = lb.bandOf[fy], cx = Math.round(bx + lb.cx + lb.lx[b]), cz = Math.round(bz + lb.cz + lb.lz[b]);
    let f = [cx, y0 + fy, cz];
    for (let s = 0; s < Math.max(Wd, Dd); s++) { const x = cx + dx * s, z = cz + dz * s; if (solid(x, fy, z)) f = [x, y0 + fy, z]; }
    faces[side] = f;
  }
  return { top, summits, crown, ledges, faces, notch, waterfall: fall, bounds: [[x0, y0, z0], [x1, y1, z1]] };
}

/**
 * Carve a cave into existing rock. mouth = [x, y, z]: floor point at the entrance (y = lowest air cell); it snaps
 * along `dir` to the rock face. opts: dir ('+x'|'-x'|'+z'|'-z', the way the mouth faces OUT), width (8), height (10; a person is 7),
 * depth (14), chamber (true | radius | false), walls ([caveRock, caveDark]), wall (sealing thickness 2), glow (true |
 * density: caveGlow dots on the ceiling), water (material) + level (y, default floor − 1: stream + pool; higher = flooded),
 * stalactites (density 0.12), length (5), vines (true | amount: strands over the mouth), leaves, snap (true), seed
 * → { mouth, inside, ceiling, end, pool }
 */
export function cave(g, mouth, o = {}) {
  const R = R_(o), seed = R.int(0, 1e6), N = noise(seed);
  const side = SIDES[o.dir ?? '+z'] ?? SIDES['+z'];
  const [ox, oz] = side, ix = -ox, iz = -oz, tx = -oz, tz = ox; // out, in, across
  const w = o.width ?? 8, h = o.height ?? 10, depth = o.depth ?? 14, wt = o.wall ?? 2;
  const walls = list(o.walls ?? ['caveRock', 'caveDark']).map((m) => g.mat(m));
  let [mx, my, mz] = mouth.map(Math.round);
  if (o.snap !== false) { // find the outer face at 60% of the mouth height (so the mouth cuts through notches/overhangs)
    const py = my + Math.max(1, Math.round(h * 0.6));
    if (g.get(mx, py, mz)) { for (let k = 0; k < 16 && g.get(mx + ox, py, mz + oz); k++) { mx += ox; mz += oz; } }
    else for (let k = 1; k <= 20; k++) if (g.get(mx + ix * k, py, mz + iz * k)) { mx += ix * k; mz += iz * k; break; }
  }
  const P = (s, u, v) => [mx + ix * s + tx * u, my + v, mz + iz * s + tz * u];
  const ch = o.chamber === false ? null : { r: typeof o.chamber === 'number' ? o.chamber : Math.max(w * 0.85, 4) + 1 };
  const cw = ch ? ch.r : 0, chh = ch ? Math.max(h * 1.1, ch.r * 1.05) : 0, cd = ch ? ch.r * 1.1 : 0;
  const uc = (s) => N.simplex2(s * 0.1, 3.3) * w * 0.3 * Math.min(1, s / 5);
  const sEnd = depth + (ch ? cd * 0.6 : 0);
  // normalized "distance" (≤ 1 inside) of the tunnel ∪ chamber, radii grown by g voxels
  const shape = (s, u, v, gr) => {
    let d = Infinity;
    if (s >= -1 && s <= depth + 1) {
      const flare = 1 + 0.3 * Math.max(0, 1 - s / 3), taper = ch ? 1 : 1 - 0.5 * clamp((s - depth * 0.6) / (depth * 0.4));
      const hw = (w / 2) * flare * taper * (1 + N.simplex2(s * 0.2, 9) * 0.12) + gr, hh = h * (0.92 + 0.08 * flare) * taper * (1 + N.simplex2(s * 0.17, 19) * 0.1) + gr;
      const vv = v + gr * 0.5 + 0.5;
      if (vv >= 0) d = Math.hypot((u - uc(s)) / hw, vv / hh);
    }
    if (ch) {
      const cs = depth + cd * 0.35, cu = uc(depth), cv = chh * 0.42;
      if (v >= -gr) d = Math.min(d, Math.hypot((s - cs) / (cd + gr), (u - cu) / (cw + gr), (v - cv) / (chh * 0.6 + gr)));
    }
    return d + (gr ? 0 : N.simplex3(s * 0.3, u * 0.3, v * 0.3) * 0.1);
  };
  const umax = Math.ceil(Math.max(w * 0.8, cw) + w * 0.3 + wt + 2), vmax = Math.ceil(Math.max(h * 1.4, chh * 1.1) + wt + 2), smax = Math.ceil(sEnd + cd + wt + 2);
  // 1. seal: a wall envelope (only into empty cells, deeper than the face) so caves never open into a hollow karst
  // 2. carve
  const carved = new Set();
  const K = (x, y, z) => `${x},${y},${z}`;
  const enclosed = (x, y, z) => { // empty cell walled in on 5 sides (a hollow karst's cavity), not open air beside thin rock
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
      let k = 1;
      while (k <= 72 && !g.get(x + dx * k, y + dy * k, z + dz * k)) k++;
      if (k > 72) return false;
    }
    return true;
  };
  // seal BEFORE carving (a half-carved tunnel would make cavity cells look open) — the envelope of the tunnel ∪
  // chamber gets walls wherever it crosses a karst's hollow interior, so the cave never opens into it
  const seal = [];
  for (let s = 3; s <= smax; s++) for (let u = -umax; u <= umax; u++) for (let v = -wt - 2; v <= vmax; v++) {
    if (shape(s, u, v, 0) <= 1 || shape(s, u, v, wt) > 1) continue;
    const [x, y, z] = P(s, u, v);
    if (!g.get(x, y, z) && enclosed(x, y, z)) seal.push(x, y, z);
  }
  for (let i = 0; i < seal.length; i += 3) g.set(seal[i], seal[i + 1], seal[i + 2], walls[0]);
  for (let s = 0; s <= smax; s++) for (let u = -umax; u <= umax; u++) for (let v = -wt - 2; v <= vmax; v++) {
    if (shape(s, u, v, 0) > 1) continue;
    const [x, y, z] = P(s, u, v);
    g.set(x, y, z, 0); carved.add(K(x, y, z));
  }
  // 3. paint the walls (rough → dark with depth); the outer lip keeps the cliff's own material
  const glowD = o.glow === true ? 0.1 : o.glow || 0, glow = glowD ? g.mat(o.glowWith ?? 'caveGlow') : 0;
  const ceilingCells = [];
  for (let s = 1; s <= smax; s++) for (let u = -umax; u <= umax; u++) for (let v = -wt - 2; v <= vmax; v++) {
    const [x, y, z] = P(s, u, v);
    if (!g.get(x, y, z) || carved.has(K(x, y, z))) continue;
    let touch = false;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (carved.has(K(x + dx, y + dy, z + dz))) { touch = true; break; }
    if (!touch) continue;
    const t = s / sEnd + N.simplex3(x * 0.2, y * 0.2, z * 0.2) * 0.25;
    g.set(x, y, z, walls[Math.min(walls.length - 1, t < 0.3 ? 0 : 1)]);
    if (carved.has(K(x, y - 1, z)) && s >= 2) ceilingCells.push([x, y, z, s]);
  }
  // 4. stalactites / stalagmites inside + a fringe hanging over the mouth
  const lo = P(0, -umax, -wt - 2), hi = P(smax, umax, vmax);
  stalactites(g, lo, hi, { density: o.stalactites ?? 0.12, length: o.length ?? Math.max(3, Math.round(h / 2.5)), seed: seed + 1, on: [...walls, ...ROCKS.filter((n) => g.palette?.has(n))] });
  const stal = g.mat(o.with ?? 'stalactite');
  for (let u = -umax; u <= umax; u++) for (const s of [0, 1]) {
    let v = 0;
    while (v <= vmax && !g.get(...P(s, u, v))) v++;
    if (v === 0 || v > vmax || hash3(u, s, 5, seed) > 0.5) continue;
    const lip = g.get(...P(s, u, v)), L = Math.min(v - 2, 1 + Math.floor(Math.pow(hash3(u, s, 6, seed), 1.5) * Math.max(2, h / 3)));
    for (let k = 1; k <= L; k++) g.put(...P(s, u, v - k), k === L && L > 2 ? stal : lip, 'keep');
  }
  // 5. glow-worms on the ceiling
  if (glow) for (const [x, y, z, s] of ceilingCells) if (s > depth * 0.25 && hash3(x, y, z, seed + 2) < glowD && !g.get(x, y - 1, z) === true) g.set(x, y, z, glow);
  // 6. water: a stream channel along the floor + a pool in the chamber, filled up to `level`
  let pool = null;
  if (o.water) {
    const wm = g.mat(o.water), level = o.level ?? my - 1;
    const cells = [];
    for (let s = 1; s <= Math.ceil(sEnd); s++) for (let u = -umax; u <= umax; u++) {
      const inPool = ch && Math.hypot((s - depth - cd * 0.35) / (cd * 0.75), (u - uc(depth)) / (cw * 0.75)) < 1;
      const inStream = s <= depth && Math.abs(u - uc(s)) <= Math.max(0.6, w / 7);
      if (!inPool && !inStream) continue;
      const dd = inPool ? 2 : 1;
      for (let v = -dd; v < 0; v++) cells.push(P(s, u, v));
      const [bx, by, bz] = P(s, u, -dd - 1);
      if (g.get(bx, by, bz)) g.set(bx, by, bz, walls[walls.length - 1]);
    }
    for (const [x, y, z] of cells) g.set(x, y, z, 0);
    for (const [x, y, z] of cells) carved.add(K(x, y, z));
    for (const k of carved) { const [x, y, z] = k.split(',').map(Number); if (y <= level && !g.get(x, y, z)) g.set(x, y, z, wm); }
    pool = ch ? P(Math.round(depth + cd * 0.35), Math.round(uc(depth)), 0) : P(Math.round(depth * 0.7), 0, 0);
  }
  // 7. vines hanging over the mouth
  const vAmt = o.vines === true ? 1 : o.vines || 0;
  if (vAmt > 0) {
    const shades = list(o.leaves ?? LEAVES).slice(0, 2);
    for (let u = -umax; u <= umax; u++) {
      if (g.get(...P(0, u, 1)) || hash3(u, 3, 7, seed) > 0.55 * vAmt) continue; // only over the open mouth
      let v = 1;
      while (v <= vmax && !g.get(...P(0, u, v))) v++;
      if (v > vmax) continue;
      const top = v + R.int(1, 4), L = R.int(3, Math.max(4, Math.round((top - 1) * 0.7)));
      for (let k = 0; k < L; k++) { const [x, y, z] = P(-1, u, top - k); if (g.get(x, y, z) || y < my + 2) break; g.set(x, y, z, g.mat(shades[(u & 1) % shades.length])); }
    }
  }
  const cs = ch ? Math.round(depth + cd * 0.35) : Math.round(depth * 0.7);
  return { mouth: [mx, my, mz], inside: P(cs, Math.round(uc(Math.min(cs, depth))), 0), ceiling: my + Math.round(ch ? chh * 0.42 + chh * 0.6 : h), end: P(Math.round(sEnd), 0, 0), pool };
}
const ROCKS = ['limestone', 'limestoneLight', 'limestoneDark', 'limestoneStreak', 'limestoneOrange', 'limestoneNotch', 'karstMoss', 'caveRock', 'caveDark', 'stone', 'stoneDark', 'stoneLight'];

/**
 * Stalactites hanging from ceilings and stalagmites rising from floors inside the box a..b (inclusive). Tapering:
 * long ones get a thick root ring, all end in 1-voxel tips. opts: density (0.08, ceilings), floor (stalagmite density,
 * density*0.6; only under a roof within `reach` 24), length (5, max), with ('stalactite'), on (rock materials; default limestone/cave/stone names), seed
 */
export function stalactites(g, a, b, o = {}) {
  const seed = o.seed ?? 1, dens = o.density ?? 0.08, fdens = o.floor ?? dens * 0.6, len = Math.max(1, o.length ?? 5), reach = o.reach ?? 24;
  const m = g.mat(o.with ?? 'stalactite');
  const on = new Set((o.on ? list(o.on) : ROCKS.filter((n) => g.palette?.has(n))).map((x) => g.mat(x)));
  const lo = [0, 1, 2].map((k) => Math.min(a[k], b[k])), hi = [0, 1, 2].map((k) => Math.max(a[k], b[k]));
  const ceil = [], flo = [];
  g.forEachIn(lo, hi, (x, y, z, id) => {
    if (on.size && !on.has(id)) return;
    if (!g.get(x, y - 1, z) && hash3(x, y, z, seed) < dens) ceil.push([x, y, z, -1]);
    if (!g.get(x, y + 1, z) && hash3(x, y, z, seed + 7) < fdens) flo.push([x, y, z, 1]);
  });
  const roofed = (x, y, z) => { for (let k = 2; k <= reach; k++) if (g.get(x, y + k, z)) return true; return false; }; // stalagmites only under a roof
  let n = 0;
  for (const [x, y, z, sg] of ceil.concat(flo.filter(([x, y, z]) => roofed(x, y, z)))) {
    let clear = 0;
    while (clear < len * 2 + 3 && !g.get(x, y + sg * (clear + 1), z)) clear++;
    if (clear < 3) continue;
    let near = false; // keep them apart
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (g.get(x + dx, y + sg, z + dz) === m) { near = true; break; }
    if (near) continue;
    const L = Math.min(1 + Math.floor(Math.pow(hash3(x, y, z, seed + 3), 1.4) * len), sg < 0 ? clear - 2 : Math.floor(clear / 2) - 1);
    if (L < 1) continue;
    for (let k = 1; k <= L; k++) g.put(x, y + sg * k, z, m, 'keep');
    if (L >= 3) for (const [dx, dz] of D4) if (g.get(x + dx, y, z + dz) && g.get(x + dx, y, z + dz) !== m) g.put(x + dx, y + sg, z + dz, m, 'keep');
    if (L >= 6) for (const [dx, dz] of D4) if (hash3(x + dx, y, z + dz, seed + 5) < 0.5 && g.get(x + dx, y + sg, z + dz) === m) g.put(x + dx, y + 2 * sg, z + dz, m, 'keep');
    n++;
  }
  return n;
}

/**
 * Small limestone islet rising from a lake: waterline notch, streaks, one clinging tree + shrubs on top.
 * base = [x, y, z] on the lake bed. opts: water (surface y; default bed + 3), height (above the water, 8–16),
 * radius (~(height + depth) * 0.27), profile ('dome' | 'tower'), + any karst() option → karst() anchors
 */
export function karstIslet(g, base, o = {}) {
  const R = R_(o);
  const water = o.water ?? base[1] + 3, depth = Math.max(0, water - base[1]);
  const above = Math.round(o.height ?? R.int(8, 16)), h = depth + above;
  const r = o.radius ?? Math.max(3, Math.round(Math.min(h, above * 1.6) * R.range(0.24, 0.32)));
  const rm = Array.isArray(r) ? (r[0] + (r[1] ?? r[0])) / 2 : r;
  return karst(g, base, {
    profile: R.chance(0.5) ? 'dome' : 'tower', hollow: false, ledges: above > 14 ? 1 : 0, trees: 0, cap: 'sparse', vines: 0.7, streaks: 0.8,
    notch: clamp(Math.round(rm * 0.4), 1, 3), shrubs: 0.6, lean: R.range(0, 0.12), ...o, R, height: h, radius: r, water,
  });
}

// ---- registration (every exported generator needs one; test.mjs checks) ----
const K_ = (fn, summary, example, meta = {}) => defineGenerator(fn, { category: 'karst', summary, example, ...meta });
const lake = (g, r = 11, bed = -4) => { g.box([-r, bed - 1, -r], [r, bed, r], 'sand'); g.box([-r, bed + 1, -r], [r, 0, r], 'water'); };
K_(karst, 'limestone karst tower / massif: sheer streaked cliffs, waterline notch, ledges, jungle cap, vine curtains',
  (g) => { lake(g); karst(g, [0, -4, 0], { height: 40, radius: 8, water: 0, seed: 3 }); }, { ground: false });
K_(cave, 'cave carved into rock: dark mouth, stalactites/stalagmites, glow-worms, pool',
  (g) => { g.box([-10, 1, -11], [10, 17, 3], 'limestone'); cave(g, [0, 1, 3], { dir: '+z', width: 8, height: 10, depth: 5, chamber: 5, glow: true, water: 'water', vines: true, seed: 3 }); });
K_(stalactites, 'stalactites + stalagmites on any ceilings/floors in a box',
  (g) => { g.box([-8, 1, -8], [8, 10, 8], 'caveRock'); g.box([-7, 2, -7], [7, 8, 8], 0); stalactites(g, [-7, 1, -7], [7, 9, 8], { density: 0.2, length: 5 }); });
K_(karstIslet, 'small rock islet with a notch and one clinging tree (lakes)',
  (g) => { lake(g); karstIslet(g, [-3, -4, -2], { height: 12, water: 0, seed: 2 }); karstIslet(g, [5, -4, 5], { height: 7, water: 0, seed: 5 }); }, { ground: false });
