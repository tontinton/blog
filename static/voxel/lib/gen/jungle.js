// Jungle trees (tropical rainforest): emergent dipterocarps with buttress roots, strangler figs, mid-canopy
// rainforest trees, a whole layered rainforest canopy, bamboo clumps, banana plants, drowned dead trees.
// Same conventions as nature.js: fn(g, p, o) with p = base position standing on y, `seed`/`R`, material
// overrides, foliage written with mode 'keep' (never overwrites trunks/buildings).
//
//   const P = new Palette({ ...NATURE, ...JUNGLE });
//   dipterocarp(g, [0, 1, 0]);                       // 62-tall emergent giant → { top, crownY, crownRadius, limbs }
//   rainforest(g, [-40, -40], [40, 40], { emergents: 3, avoid: [[[0, 0], [12, 10]]] });   // a whole canopy
//
// Crowns are clusters of lumps (cauliflower florets): each lump gets a sunlit yellow-green cap and darker,
// blue-green undersides, so canopies read as broccoli from the isometric camera. Shade arrays are dark → light.
import { rng, noise, hash3, clamp } from '../random.js';
import { spline } from '../shapes.js';
import { defineGenerator } from '../registry.js';

/** Default materials for the jungle generators. Spread into your palette and override freely. */
export const JUNGLE = {
  barkPale: { color: '#b8ab92', jitter: 0.05, noise: { color: '#9a8e78', scale: 0.3, amount: 0.6 } },  // dipterocarp
  barkPaleDark: { color: '#8e8370', jitter: 0.05 },
  barkPaleLight: { color: '#d2c6ad', jitter: 0.04 },
  figRoot: { color: '#8a7a62', jitter: 0.06, noise: { color: '#6e604c', scale: 0.4, amount: 0.6 } },   // strangler fig
  figRootDark: { color: '#5e5242', jitter: 0.05 },
  jungleLeafDark: { color: '#1d4a26', jitter: 0.05, sway: 0.25 },
  jungleLeaf: { color: '#2c6a2e', jitter: 0.05, sway: 0.3 },
  jungleLeafLight: { color: '#4a8a34', jitter: 0.05, sway: 0.35 },
  jungleLeafSun: { color: '#78a83a', jitter: 0.05, sway: 0.35 },   // sunlit crown tops (yellow-green)
  canopyBlue: { color: '#2a5a48', jitter: 0.05, sway: 0.25 },      // blue-green shade, far canopy
  bamboo: { color: '#a4b84a', jitter: 0.04 },
  bambooDark: { color: '#7a9a36', jitter: 0.04 },
  bambooLight: { color: '#c8d06a', jitter: 0.04 },
  bambooNode: { color: '#5e6a2a', jitter: 0.03 },
  bambooLeaf: { color: '#4f8a30', jitter: 0.06, sway: 0.6 },
  bananaLeaf: { color: '#5aa03a', jitter: 0.05, sway: 0.5 },
  bananaLeafDark: { color: '#3e7a2a', jitter: 0.05, sway: 0.5 },
  bananaTrunk: { color: '#7a8a4a', jitter: 0.05 },
  bananaFruit: { color: '#c8c040', jitter: 0.04 },
  bananaFlower: { color: '#7a2a4a', jitter: 0.04 },
  deadWood: { color: '#c8c0b0', jitter: 0.05, noise: { color: '#a8a090', scale: 0.4, amount: 0.5 } },  // bleached drowned trunks
  deadWoodDark: { color: '#8a8478', jitter: 0.05 },
  flameFlower: { color: '#e8602a', jitter: 0.06, sway: 0.3 },      // flowering canopy accent
  flameFlowerLight: { color: '#f49a3a', jitter: 0.05, sway: 0.3 },
  yellowFlower: { color: '#e8c43a', jitter: 0.05, sway: 0.3 },
  // added by the generators below
  jungleBarkMoss: { color: '#55693a', jitter: 0.07 },              // mossy trunk bases / buttress feet
  figFruit: { color: '#c8503a', jitter: 0.06, sway: 0.25 },        // ripe figs (hornbill food)
  bananaDry: { color: '#a08048', jitter: 0.06, sway: 0.2 },        // dead hanging banana leaves
  deadWoodWet: { color: '#6a665c', jitter: 0.05 },                 // waterline ring / submerged trunk
};

const TAU = Math.PI * 2;
const list = (m) => (Array.isArray(m) ? m : [m]);
const R_ = (o) => o.R ?? rng(o.seed ?? 1);
const band = (shades, t) => shades[clamp(Math.floor(t * shades.length), 0, shades.length - 1)];
const LEAVES = ['canopyBlue', 'jungleLeafDark', 'jungleLeaf', 'jungleLeafLight', 'jungleLeafSun'];
const FLOWERS = { flameFlower: ['flameFlower', 'flameFlowerLight'], yellowFlower: ['yellowFlower', 'flameFlowerLight'] };
const flowerShades = (f) => (typeof f === 'string' && FLOWERS[f] ? FLOWERS[f] : list(f));

/**
 * Crown of lumps [{ c, r, sq (vertical squash), flat (cut below c - flat·ry), b (shade bias) }]: each voxel is
 * shaded by its height inside the lump it belongs to → lit caps, darker undersides (crisp bands merge well).
 */
function crown(g, L, o = {}) {
  const shades = list(o.leaves ?? LEAVES).map((m) => g.mat(m));
  const N = noise(o.seed ?? 7);
  const amp = o.roughness ?? 0.16, f = o.freq ?? 0.3, sp = o.speckle ?? 0.04, mode = o.mode ?? 'keep', bias = o.bias ?? 0;
  const fl = o.flowers ? flowerShades(o.flowers).map((m) => g.mat(m)) : null, fa = o.flowerAmount ?? 0.3;
  const mask = o.mask;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const l of L) {
    l.ry = l.r * (l.sq ?? 1); l.fl = l.flat ?? 1;
    const e = [l.r + 1, l.ry + 1, l.r + 1];
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], Math.floor(l.c[k] - e[k])); hi[k] = Math.max(hi[k], Math.ceil(l.c[k] + e[k])); }
  }
  for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
    if (mask && !mask(x, z)) continue;
    // lumps overlapping this column
    const C = [];
    for (const l of L) { const dx = (x - l.c[0]) / l.r, dz = (z - l.c[2]) / l.r, q = dx * dx + dz * dz; if (q < 1.6) C.push(l, q); }
    if (!C.length) continue;
    for (let y = lo[1]; y <= hi[1]; y++) {
      let best = Infinity, bl = null;
      for (let i = 0; i < C.length; i += 2) {
        const l = C[i], dy = (y - l.c[1]) / l.ry;
        if (dy < -l.fl) continue;
        const d = C[i + 1] + dy * dy;
        if (d < best) { best = d; bl = l; }
      }
      if (best > 1.7) continue;
      const n = N.simplex3(x * f, y * f * 1.3, z * f);
      if (Math.sqrt(best) + n * amp > 1) continue;
      const u = (y - bl.c[1]) / bl.ry;
      let m = band(shades, 0.44 + 0.52 * u + (bl.b ?? 0) + bias + n * 0.05 + (hash3(x, y, z, 5) - 0.5) * sp);
      if (fl && u > 0.05 && N.simplex3(x * 0.55 + 31, y * 0.55, z * 0.55 + 17) > 1 - fa * 2) m = fl[hash3(x, y, z, 9) < 0.3 ? 1 % fl.length : 0];
      g.put(x, y, z, m, mode);
    }
  }
  return g;
}

/** Filled horizontal disc of radius r centered on (cx, cz) (float center = voxel coords). */
function disc(g, cx, y, cz, r, m, mode) {
  const rr = r * r + 0.01;
  for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz <= rr) g.put(x, y, z, m, mode);
  }
}

/**
 * Polyline through spline samples as a tapered tube (r ≤ 0.5 → 1-voxel line). With a mask: only inside it. With `later`
 * (an array): queued, to be drawn after the crown in 'keep' mode, so branches only show where they're out in the air.
 */
function limb(g, pts, m, r, r2, mask, later) {
  const draw = () => {
    const mm = mask ? (x, y, z) => (mask(x, z) ? (typeof m === 'function' ? m(x, y, z) : m) : 0) : m;
    g.tube(pts, mm, { r, r2, steps: 5, mode: later || mask ? 'keep' : 'replace' });
  };
  if (later) later.push(draw); else draw();
  return spline(pts, 5);
}
const at = (path, t) => path[clamp(Math.round(t * (path.length - 1)), 0, path.length - 1)].map(Math.round);

/** Vertical streaky pale bark: crisp dark streaks + lichen patches + moss at the foot. */
function paleBark(shades, moss, by, N) {
  return (x, y, z) => {
    if (moss && y <= by + Math.floor(hash3(x, 0, z, 3) * 3.5) && N.simplex3(x * 0.3, y * 0.3, z * 0.3) > 0) return moss;
    const seg = Math.floor((y + hash3(x, 0, z, 77) * 37) / 7);
    if (hash3(x, seg, z, 78) < 0.14) return shades[0];
    if (N.simplex3(x * 0.4, y * 0.12, z * 0.4) > 0.42) return shades[2] ?? shades[1];
    return shades[1] ?? shades[0];
  };
}

/** Thin plank fin (buttress root) radiating from (bx, bz): 4-connected cells, concave top edge. */
function fin(g, bx, by, bz, a, r0, L, H, curl, mat, mask, pw = 1.3) {
  let px = null, pz = null, ph = 0;
  const col = (x, z, hh) => { if (mask && !mask(x, z)) return; for (let y = by - 3; y <= by + hh; y++) g.put(x, y, z, mat, y < by || mask ? 'keep' : 'replace'); };
  for (let s = 0; s <= L; s += 0.2) {
    const k = s / L, ang = a + curl * k * k, d = r0 + s;
    const x = Math.round(bx + Math.cos(ang) * d), z = Math.round(bz + Math.sin(ang) * d);
    if (x === px && z === pz) continue;
    const hh = Math.round(H * Math.pow(1 - k, pw));
    col(x, z, hh);
    if (px !== null && x !== px && z !== pz) col(px, z, Math.round((hh + ph) / 2));
    px = x; pz = z; ph = hh;
  }
}

// ---- dipterocarp -------------------------------------------------------------------------------------

/**
 * Emergent dipterocarp (rainforest giant): tall straight pale trunk, flaring plank buttresses, bare bole, a few
 * thick limbs under a broad flat-topped cauliflower crown. opts: height (55–75, 62), crownRadius (~0.28h, 9–20),
 * crownDepth (~r/2), trunkRadius (~h/22: 5–6 wide), buttresses (5–7), buttressLength (6–9), buttressHeight (8–12),
 * primaries (2–3 big limbs off the bole), limbs (4–6 crown clusters, +1–2), bark ([dark, mid, light]), moss, leaves
 * (shades dark → light), flowers, flowerAmount, bias (+ = sunnier crown), lean, mask, seed.
 * Returns { base, top, crownY (crown underside), crownRadius, limbs: [[x,y,z]…] (points on the limbs: perches, liana
 * and epiphyte anchors), tips (cluster bases), trunkTop (the fork) }.
 */
export function dipterocarp(g, p, o = {}) {
  const R = R_(o);
  const [bx, by, bz] = p;
  const h = o.height ?? 62;
  const Rc = o.crownRadius ?? clamp(h * 0.28, 9, 20);
  const T = o.crownDepth ?? Math.max(5, Rc * 0.5);
  const top = by + h, cb = Math.round(top - T);
  const forkY = Math.round(cb - Math.max(4, h * 0.18));
  const r0 = o.trunkRadius ?? clamp(h / 22, 1.4, 3.2), r1 = Math.max(1.1, r0 * 0.6);
  const shades = list(o.bark ?? ['barkPaleDark', 'barkPale', 'barkPaleLight']), moss = o.moss ?? 'jungleBarkMoss';
  const N = noise(R.int(0, 1e6));
  const barkAt = paleBark(shades, moss, by, N), later = [];
  // trunk: straight, slight bend, flared foot
  const la = R() * TAU, lm = R.range(0, o.lean ?? 1.2);
  const tx = (t) => bx + Math.cos(la) * lm * t * t, tz = (t) => bz + Math.sin(la) * lm * t * t;
  for (let y = by - 3; y <= forkY + 1; y++) {
    const t = clamp((y - by) / (forkY - by));
    const r = r0 + (r1 - r0) * Math.pow(t, 0.7) + Math.max(0, by + 3 - y) * 0.3;
    disc(g, Math.round(tx(t)), y, Math.round(tz(t)), r, barkAt, y < by || o.mask ? 'keep' : 'replace');
  }
  // buttresses
  const nb = o.buttresses ?? R.int(5, 7), a0 = R() * TAU;
  for (let i = 0; i < nb; i++) {
    const a = a0 + (i / nb) * TAU + R.range(-0.3, 0.3);
    const L = (o.buttressLength ?? R.range(6, 9)) * R.range(0.85, 1.1), H = (o.buttressHeight ?? R.range(8, 12)) * R.range(0.85, 1.1);
    fin(g, bx, by, bz, a, r0 * 0.6, L + r0 * 0.4, H, R.range(-0.5, 0.5), barkAt, o.mask, 1.1);
  }
  // a couple of broken stubs on the bole
  for (let i = 0, n = R.int(0, 2); i < n; i++) {
    const y = Math.round(by + h * R.range(0.45, 0.7)), a = R() * TAU, t = (y - by) / (forkY - by), r = r0 + (r1 - r0) * Math.pow(t, 0.7);
    const c = [tx(t), y, tz(t)];
    g.line(c, [c[0] + Math.cos(a) * (r + 1.3), y + 2, c[2] + Math.sin(a) * (r + 1.3)], shades[0], { r: 0.5 });
  }
  // crown: one cauliflower cluster per limb (a main floret + 2–3 lower satellites) around a central floret
  const fx = Math.round(tx(1)), fz = Math.round(tz(1));
  const nl = o.limbs ?? R.int(4, 6), lb = R() * TAU;
  const lumps = [], limbs = [], tips = [];
  const fork = [fx, forkY, fz];
  const floret = (c, r, sq, b) => { const l = { c, r, sq, b }; l.flat = Math.max(0.2, (c[1] - (cb + R.range(-0.5, 1.5))) / (r * sq)); lumps.push(l); return l; };
  const rC = Rc * 0.3;
  floret([fx, top - rC * 0.75 - R.range(0, 1), fz], rC, 0.75, 0.04);
  // 2–3 primary limbs fork from the bole, each splits into secondaries that carry the cauliflower clusters
  const np = o.primaries ?? R.int(2, 3), pa = R() * TAU, prim = [];
  for (let j = 0; j < np; j++) {
    const a = pa + (j / np) * TAU + R.range(-0.3, 0.3), d = Rc * R.range(0.2, 0.28);
    const knee = [fx + Math.cos(a) * d, forkY + (cb - forkY) * R.range(0.45, 0.6), fz + Math.sin(a) * d];
    const path = limb(g, [[fx, forkY - 1, fz], [fx + Math.cos(a) * d * 0.4, forkY + (knee[1] - forkY) * 0.45, fz + Math.sin(a) * d * 0.4], knee], shades[1], r1 * 0.95, r1 * 0.75, o.mask, later);
    prim.push({ a, knee, path }); limbs.push(at(path, 0.75));
  }
  const nc = nl + R.int(1, 2);
  for (let i = 0; i < nc; i++) {
    const a = lb + (i / nc) * TAU + R.range(-0.35, 0.35);
    const d = Rc * R.range(0.42, 0.62), rm = Rc * R.range(0.27, 0.34);
    const main = floret([fx + Math.cos(a) * d, top - rm * 0.72 - R.range(0, 2.2), fz + Math.sin(a) * d], rm, 0.72, R.range(-0.04, 0.06));
    const end = [main.c[0], cb + 1, main.c[2]];
    const pr = prim.reduce((A, B) => (Math.abs(angDiff(B.a, a)) < Math.abs(angDiff(A.a, a)) ? B : A));
    const k = pr.knee;
    const path = limb(g, [k, [k[0] + (end[0] - k[0]) * 0.55, k[1] + (end[1] - k[1]) * 0.45, k[2] + (end[2] - k[2]) * 0.55], end], shades[1], r1 * 0.7, 0.6, o.mask, later);
    limbs.push(at(path, 0.6)); tips.push(end.map(Math.round));
    for (let q = 0, ns = R.int(1, 3); q < ns; q++) {
      const sa = a + (q - (ns - 1) / 2) * R.range(0.8, 1.2) + R.range(-0.3, 0.3), rs = Rc * R.range(0.19, 0.25);
      const sc = [main.c[0] + Math.cos(sa) * rm * 0.95, main.c[1] - R.range(0.5, 2.2), main.c[2] + Math.sin(sa) * rm * 0.95];
      floret(sc, rs, 0.75, R.range(-0.08, 0.02));
      const tw = limb(g, [at(path, 0.8), [(end[0] + sc[0]) / 2, cb - 0.5, (end[2] + sc[2]) / 2], [sc[0], cb + 0.5, sc[2]]], shades[0], 0.6, 0.5, o.mask, later);
      limbs.push(at(tw, 0.55));
    }
  }
  crown(g, lumps, { leaves: o.leaves, flowers: o.flowers, flowerAmount: o.flowerAmount, bias: o.bias, seed: R.int(0, 1e6), mask: o.mask });
  for (const f of later) f();
  return { base: [bx, by, bz], top: [fx, top, fz], crownY: cb, crownRadius: Rc, limbs, tips, trunkTop: [fx, forkY, fz] };
}
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ---- strangler fig -----------------------------------------------------------------------------------

/**
 * Strangler fig: a hollow lattice of intertwined roots where the host tree rotted away, aerial roots dangling
 * from the limbs to the ground, a dense dark rounded crown with ripe figs. opts: height (35–50, 42), crownRadius
 * (~0.3h), columnRadius (~h/8), roots (helical strands per direction, 6–7), limbs (5–7), aerial (dangling roots, 14),
 * door (true: an arched gap at the foot), doorAngle (radians, π/4 = facing +x+z), root (shades [dark, mid]), leaves,
 * fruit ('figFruit' | false), fruitAmount (0.1), bias, mask, seed.
 * Returns { base, top, crownY, crownRadius, limbs, tips, hollow (a point inside the column at the foot) }.
 */
export function strangler(g, p, o = {}) {
  const R = R_(o);
  const [bx, by, bz] = p;
  const h = o.height ?? 42, Rc = o.crownRadius ?? clamp(h * 0.3, 8, 16);
  const ry = Rc * 0.62, top = by + h, cc = top - ry;           // crown center
  const colTop = Math.round(cc - ry * 0.55);
  const rc0 = o.columnRadius ?? clamp(h / 8, 3, 6.5), rc1 = rc0 * 0.75;
  const roots = list(o.root ?? ['figRootDark', 'figRoot']);
  const N = noise(R.int(0, 1e6)), later = [];
  const door = o.door === false ? null : (o.doorAngle ?? Math.PI / 4), dw = 0.6;
  const span = colTop - by;
  // lattice: a hollow shell where two families of helical roots (and a few straight pillar roots) are kept,
  // evaluated in unrolled (angle, height) space → crisp diamond-shaped holes; an arched doorway at the foot
  const ns = o.roots ?? R.int(6, 7), om = R.range(0.11, 0.14) * (R.chance(0.5) ? 1 : -1), cell = TAU / ns;
  const pil = [], np = R.int(2, 4);
  for (let i = 0; i < np; i++) pil.push(R() * TAU);
  const doorH = Math.min(span * 0.5, 9 + h * 0.05);
  const radAt = (y) => { const k = clamp((y - by) / span); return rc0 + (rc1 - rc0) * k + (y < by + 4 ? (by + 4 - y) * 0.45 : 0); };
  const pa = R() * TAU, pb = R() * TAU, wA = 0.62, wB = 0.52;
  for (let y = by - 2; y <= colTop + 1; y++) {
    const rad = radAt(y), rIn = rad - 1.25;
    for (let z = Math.floor(bz - rad - 1); z <= Math.ceil(bz + rad + 1); z++) for (let x = Math.floor(bx - rad - 1); x <= Math.ceil(bx + rad + 1); x++) {
      const dx = x - bx, dz = z - bz, d = Math.hypot(dx, dz);
      if (d > rad + 0.25 || (d < rIn && y >= by) || (o.mask && !o.mask(x, z))) continue;
      let th = Math.atan2(dz, dx) + N.simplex3(x * 0.15, y * 0.08, z * 0.15) * 0.2;
      const collar = y >= colTop - 1;
      if (door != null && y >= by && y < by + doorH) {
        const t = (y - by) / doorH;
        if (Math.abs(angDiff(th, door)) < dw * Math.sqrt(1 - t * t)) continue;
      }
      const ph = (v) => { const q = ((v % cell) + cell) % cell; return Math.min(q, cell - q) * rad; };   // arc distance to the nearest strand
      const dA = ph(th - om * y - pa), dB = ph(th + om * y - pb);
      let dP = Infinity;
      for (const q of pil) dP = Math.min(dP, Math.abs(angDiff(th, q)) * rad);
      let m = 0;
      if (dP < 0.95) m = roots[roots.length - 1];
      else if (dA < wA * (1 + (by + 3 - y > 0 ? 0.4 : 0))) m = roots[roots.length - 1];
      else if (dB < wB) m = roots[0];
      else if (collar || y < by) m = roots[0];
      if (m) g.put(x, y, z, m, y < by ? 'keep' : 'replace');
    }
  }
  // root fingers spreading over the ground
  for (let i = 0, n = R.int(5, 8), a0 = R() * TAU; i < n; i++) {
    const a = a0 + (i / n) * TAU + R.range(-0.3, 0.3);
    if (door != null && Math.abs(angDiff(a, door)) < dw * 0.8) continue;
    fin(g, bx, by, bz, a, rc0 - 0.5, R.range(3, 6), R.range(1.5, 3), R.range(-0.6, 0.6), roots[roots.length - 1], o.mask);
  }
  // limbs radiating from the column top into the crown
  const nl = o.limbs ?? R.int(5, 7), lb = R() * TAU;
  const lumps = [{ c: [bx, cc + ry * 0.15, bz], r: Rc * 0.62, sq: 0.95, b: 0.02 }];
  const limbs = [], tips = [], hang = [];
  for (let i = 0; i < nl; i++) {
    const a = lb + (i / nl) * TAU + R.range(-0.3, 0.3), d = Rc * R.range(0.55, 0.7);
    const start = [bx + Math.cos(a) * rc1 * 0.7, colTop, bz + Math.sin(a) * rc1 * 0.7];
    const end = [bx + Math.cos(a) * d, cc - ry * 0.25, bz + Math.sin(a) * d];
    const mid = [bx + Math.cos(a) * d * 0.5, colTop + (end[1] - colTop) * 0.35, bz + Math.sin(a) * d * 0.5];
    const path = limb(g, [start, mid, end], roots[1] ?? roots[0], 1.05, 0.6, o.mask, later);
    limbs.push(at(path, 0.55)); tips.push(end.map(Math.round));
    for (const t of [0.6, 0.8, 0.95]) if (R.chance(0.85)) hang.push(at(path, t + R.range(-0.05, 0.05)));
    const r = Rc * R.range(0.42, 0.5);
    lumps.push({ c: [end[0] + Math.cos(a) * r * 0.25, end[1] + r * 0.35, end[2] + Math.sin(a) * r * 0.25], r, sq: 0.8, b: R.range(-0.06, 0.04) });
  }
  for (let i = 0; i < 3; i++) { const a = R() * TAU, d = Rc * R.range(0.15, 0.35), r = Rc * R.range(0.38, 0.45); lumps.push({ c: [bx + Math.cos(a) * d, top - r * 0.85, bz + Math.sin(a) * d], r, sq: 0.85, b: 0.04 }); }
  const under = cc - ry * 0.45;
  for (const l of lumps) l.flat = Math.max(0.2, (l.c[1] - under - R.range(-1, 1)) / l.ry);
  // aerial roots: from limbs and the crown underside down to the ground (some stop short)
  const na = o.aerial ?? 14;
  for (let i = 0; i < na; i++) {
    let s;
    if (i < hang.length) s = hang[i];
    else { const a = R() * TAU, d = Rc * R.range(0.45, 0.85); s = [Math.round(bx + Math.cos(a) * d), Math.round(under), Math.round(bz + Math.sin(a) * d)]; }
    if (door != null && Math.abs(angDiff(Math.atan2(s[2] - bz, s[0] - bx), door)) < dw + 0.3 && Math.hypot(s[0] - bx, s[2] - bz) < Rc * 0.75) continue;
    const reach = R.chance(0.7) ? by - 2 : Math.round(s[1] - (s[1] - by) * R.range(0.3, 0.7));
    const m = roots[R.chance(0.5) ? 0 : roots.length - 1];
    let x = s[0], z = s[2];
    for (let y = s[1] - 1; y >= reach; y--) {
      if (hash3(x, y, z, 41) < 0.04) x += hash3(x, y, z, 42) < 0.5 ? 1 : -1;   // slight kinks
      if (y < by && g.get(x, y, z)) break;
      if (!o.mask || o.mask(x, z)) g.put(x, y, z, m, 'keep');
    }
  }
  const fruit = o.fruit === false ? null : o.fruit ?? 'figFruit';
  crown(g, lumps, {
    leaves: o.leaves ?? ['canopyBlue', 'jungleLeafDark', 'jungleLeafDark', 'jungleLeaf', 'jungleLeafLight'],
    flowers: fruit, flowerAmount: o.fruitAmount ?? 0.1, bias: o.bias, roughness: 0.18, seed: R.int(0, 1e6), mask: o.mask,
  });
  for (const f of later) f();
  return { base: [bx, by, bz], top: [bx, top, bz], crownY: Math.round(under), crownRadius: Rc, limbs, tips, hollow: [bx, by, bz] };
}

// ---- mid-canopy tree ---------------------------------------------------------------------------------

const TRUNKS = [['barkPaleDark', 'barkPale', 'barkPaleLight'], ['figRootDark', 'figRoot', 'barkPale'], ['barkPale', 'barkPaleLight', 'barkPaleLight']];

/**
 * Mid-canopy rainforest tree: slender trunk, irregular multi-clump crown. opts: height (18–35), style
 * 'round' | 'layered' | 'spreading' | 'tall' (random by seed), crownRadius, trunk (shades or id), trunkRadius,
 * lean, leaves (shades dark → light), bias (−0.2 darker … +0.2 sunnier), flowers ('flameFlower' |
 * 'yellowFlower' | [ids]: a flowering crown), flowerAmount (0.3), crownDepth (round/tall: fraction of h the crown
 * spans, 0.42 / 0.6), roots (small buttress fins, default h > 26), moss, roughness, mask ((x, z) → bool: draw only
 * inside; also makes trunks/limbs non-overwriting), seed. Returns { base, top, crownY, crownRadius, limbs, style }.
 */
export function jungleTree(g, p, o = {}) {
  const R = R_(o);
  const [bx, by, bz] = p;
  const style = o.style ?? R.pick(['round', 'round', 'layered', 'spreading', 'tall']);
  const h = o.height ?? R.int(20, 32);
  const Rc = o.crownRadius ?? h * ({ round: 0.31, layered: 0.3, spreading: 0.38, tall: 0.19 }[style] ?? 0.31) * R.range(0.9, 1.1);
  const shades = list(o.trunk ?? R.pick(TRUNKS));
  const N = noise(R.int(0, 1e6));
  const barkAt = shades.length > 1 ? paleBark(shades, o.moss === false ? null : o.moss ?? 'jungleBarkMoss', by, N) : shades[0];
  const tr = o.trunkRadius ?? clamp(h / 24, 0.6, 1.4);
  const la = R() * TAU, lean = o.lean ?? R.range(0, 0.12);
  const top = by + h;
  const lumps = [], limbs = [], later = [];
  let forkY, cb;
  const lx = (y) => bx + Math.cos(la) * lean * (y - by), lz = (y) => bz + Math.sin(la) * lean * (y - by);
  const trunkTo = (y1, r1) => {
    for (let y = by - 2; y <= y1; y++) {
      const t = clamp((y - by) / Math.max(1, y1 - by)), r = tr + (r1 - tr) * t + Math.max(0, by + 2 - y) * 0.35;
      const mode = y < by || o.mask ? 'keep' : 'replace';
      if (r <= 0.55) g.put(Math.round(lx(y)), y, Math.round(lz(y)), barkAt, mode);
      else disc(g, Math.round(lx(y)), y, Math.round(lz(y)), r, barkAt, mode);
    }
  };
  const branchTo = (from, end, r) => { const mid = [(from[0] + end[0]) / 2, from[1] + (end[1] - from[1]) * 0.7, (from[2] + end[2]) / 2]; limbs.push(at(limb(g, [from, mid, end], barkAt, r, Math.max(0.5, r * 0.6), o.mask, later), 0.6)); };
  if (style === 'layered') {
    // pagoda: straight trunk, 2–4 flat tiers shrinking upward
    const nt = R.int(2, 4);
    forkY = top - 2; trunkTo(forkY, tr * 0.5);
    cb = Infinity;
    for (let k = 0; k < nt; k++) {
      const f = nt === 1 ? 1 : k / (nt - 1), y = Math.round(by + h * (0.5 + 0.42 * f)), rt = Rc * (1 - 0.5 * f);
      const c = [lx(y), y, lz(y)];
      const np = Math.max(3, Math.round(rt / 1.6));
      for (let i = 0; i < np; i++) {
        const a = (i / np) * TAU + R.range(-0.3, 0.3) + k, d = rt * R.range(0.45, 0.6), r = rt * R.range(0.45, 0.6);
        const l = { c: [c[0] + Math.cos(a) * d, y + R.range(0, 1), c[2] + Math.sin(a) * d], r, sq: 1.6 / r + 0.18, flat: 0.5, b: 0.02 * k };
        lumps.push(l);
        if (i % 2 === 0) branchTo([c[0], y - 2, c[2]], [l.c[0], y, l.c[2]], 0.55);
      }
      lumps.push({ c: [c[0], y + 1, c[2]], r: rt * 0.5, sq: 2 / (rt * 0.5) + 0.2, flat: 0.5, b: 0.04 });
      cb = Math.min(cb, y - 1);
    }
  } else if (style === 'spreading') {
    // umbrella: low fork, long ascending limbs, wide flat-topped crown
    const n = R.int(5, 7), sq = 0.6;
    forkY = Math.round(by + h * 0.38);
    trunkTo(forkY, Math.max(0.55, tr * 0.75));
    const F = [lx(forkY), forkY, lz(forkY)], cx = lx(top), cz = lz(top), capR = Rc * 0.5;
    lumps.push({ c: [cx, top - capR * sq, cz], r: capR, sq, b: 0.05 });
    const a0 = R() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + R.range(-0.35, 0.35), d = Rc * 0.62 * R.range(0.8, 1.15), r = Rc * R.range(0.36, 0.46);
      const l = { c: [cx + Math.cos(a) * d, top + Rc * R.range(-0.32, -0.15) - r * sq * 0.3, cz + Math.sin(a) * d], r, sq: sq * R.range(0.85, 1.1), b: R.range(-0.08, 0.04) };
      lumps.push(l);
      branchTo(F, [l.c[0], l.c[1] - l.r * l.sq * 0.4, l.c[2]], Math.max(0.55, tr * 0.6));
    }
    limb(g, [F, [cx, top - capR * sq * 1.2, cz]], barkAt, Math.max(0.55, tr * 0.6), 0.5, o.mask, later);
    cb = Math.round(Math.min(...lumps.map((l) => l.c[1] - l.r * l.sq * 0.55)));
  } else {
    // round / tall: florets spread over an ellipsoid envelope (radius Rc, depth D) → a deep cauliflower dome
    const tall = style === 'tall', sq = tall ? 0.9 : 0.8;
    const D = h * (o.crownDepth ?? (tall ? 0.6 : 0.42)), hy = D / 2, yc = top - hy;
    forkY = Math.round(Math.max(by + 2, top - D * 0.8));
    trunkTo(forkY, Math.max(0.55, tr * 0.75));
    const F = [lx(forkY), forkY, lz(forkY)], cx = lx(top), cz = lz(top), capR = Rc * (tall ? 0.7 : 0.55);
    lumps.push({ c: [cx, top - capR * sq, cz], r: capR, sq, b: 0.05 });
    const n = tall ? R.int(4, 6) : R.int(5, 8), a0 = R() * TAU;
    for (let i = 0; i < n; i++) {
      const v = clamp(-0.75 + 1.3 * (i / (n - 1)) + R.range(-0.15, 0.15), -0.9, 0.7);
      const a = a0 + i * 2.4 + R.range(-0.3, 0.3), r = Rc * R.range(0.4, 0.52) * (tall ? 1.25 : 1);
      const d = Math.max(0, Rc - r * 0.8) * Math.sqrt(1 - v * v) * R.range(0.85, 1.05);
      const l = { c: [cx + Math.cos(a) * d, yc + v * Math.max(0, hy - r * sq * 0.6), cz + Math.sin(a) * d], r, sq, b: v * 0.06 + R.range(-0.06, 0.03) };
      lumps.push(l);
      branchTo(F, [l.c[0], l.c[1] - l.r * l.sq * 0.4, l.c[2]], Math.max(0.55, tr * 0.6));
    }
    limb(g, [F, [cx, top - capR * sq * 1.2, cz]], barkAt, Math.max(0.55, tr * 0.6), 0.5, o.mask, later);
    cb = Math.round(top - D);
  }
  for (const l of lumps) l.flat = l.flat ?? Math.max(0.3, (l.c[1] - cb) / (l.r * (l.sq ?? 1)));
  // small buttress fins on the bigger trees
  if (o.roots ?? h > 26) for (let i = 0, n = R.int(3, 4), a0 = R() * TAU; i < n; i++) fin(g, bx, by, bz, a0 + (i / n) * TAU + R.range(-0.3, 0.3), tr * 0.5, R.range(2.5, 4), R.range(2.5, 4.5), R.range(-0.4, 0.4), barkAt, o.mask);
  crown(g, lumps, { leaves: o.leaves, flowers: o.flowers, flowerAmount: o.flowerAmount, bias: o.bias, seed: R.int(0, 1e6), mask: o.mask, roughness: o.roughness });
  for (const f of later) f();
  return { base: [bx, by, bz], top: [Math.round(lx(top)), top, Math.round(lz(top))], crownY: cb, crownRadius: Rc, limbs, style };
}

/** In-place two-pass chamfer distance transform (1, √2) over a W×D field (0 = source). */
function chamfer(d, W, D) {
  const relax = (i, j, w) => { if (d[j] + w < d[i]) d[i] = d[j] + w; };
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = x + z * W;
    if (x > 0) relax(i, i - 1, 1);
    if (z > 0) { relax(i, i - W, 1); if (x > 0) relax(i, i - W - 1, 1.414); if (x < W - 1) relax(i, i - W + 1, 1.414); }
  }
  for (let z = D - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {
    const i = x + z * W;
    if (x < W - 1) relax(i, i + 1, 1);
    if (z < D - 1) { relax(i, i + W, 1); if (x < W - 1) relax(i, i + W + 1, 1.414); if (x > 0) relax(i, i + W - 1, 1.414); }
  }
  return d;
}

// ---- rainforest --------------------------------------------------------------------------------------

/**
 * Dense layered rainforest over the rectangle a = [x0, z0] … b = [x1, z1]: packed deep cauliflower crowns at varied
 * heights (an unbroken lumpy carpet from above, a mosaic of greens), lower darker crowns in gaps, a sub-canopy curtain
 * along every forest edge (rivers, clearings, the area border) that steps the canopy down so edges read as walls of
 * green, a few emergent dipterocarps and the odd flowering crown. Trees stand on g.top(x, z) + 1 (any terrain).
 * opts: density (1), height ([18, 30] canopy range), gaps (0..1, 0.25), flowering (fraction of crowns, 0.06), flowers
 * (['flameFlower', 'yellowFlower']), emergents (count, ~1 per 2500 cells, placed toward −x/−z; or [[x, z], …]),
 * emergentHeight ([hMax + 18, hMax + 30]), on (ground material names/ids; default: any solid that isn't water/glass/
 * swaying foliage), avoid ([[[x0, z0], [x1, z1]], …] rectangles kept clear of trunks and foliage), overhang (how far
 * foliage may reach over water/avoided cells, 2), clip (true: nothing outside a…b), border (true: the area border is a
 * forest edge — curtain + step-down; false at a seam with more forest beyond it), edge (curtain depth in cells, 7;
 * 0 = none, saves ~25% quads), leaves (shades), trunk (shades), seed.
 * Returns { trees: [{ base, top, crownY, crownRadius, limbs, style }], emergents: [dipterocarp anchors], top (highest y) }.
 */
export function rainforest(g, a, b, o = {}) {
  const R = R_(o);
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
  const W = x1 - x0 + 1, D = z1 - z0 + 1;
  const [hMin, hMax] = o.height ?? [18, 30];
  const N = noise(R.int(0, 1e6));
  const T = g.tops(x0, z0, x1, z1), P = g.palette;
  const on = o.on ? new Set(list(o.on).map((m) => g.mat(m))) : null;
  const okId = new Map();
  const groundOk = (id) => {
    if (on) return on.has(id);
    if (!okId.has(id)) { const d = P?.defs?.[id]; okId.set(id, !!id && !(d && (d.kind > 0 || (d.src?.sway ?? 0) > 0))); }
    return okId.get(id);
  };
  const avoid = (o.avoid ?? []).map(([p, q]) => [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]);
  const inAvoid = (x, z) => avoid.some((r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]);
  const clip = o.clip !== false;
  const inArea = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  const roomAvoid = (x, z) => { let d = Infinity; for (const r of avoid) d = Math.min(d, Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]))); return d; };
  // forest cells + chamfer distance (in cells) to the nearest non-forest cell (water, avoided, no ground, border)
  const ok = new Uint8Array(W * D), dist = new Float32Array(W * D);
  const BIG = 1e9, border = o.border !== false;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const i = (x - x0) + (z - z0) * W;
    ok[i] = T.y[i] > -2147483648 && groundOk(T.id[i]) && !inAvoid(x, z) ? 1 : 0;
    dist[i] = ok[i] ? (border && (x === x0 || x === x1 || z === z0 || z === z1) ? 1 : BIG) : 0;
  }
  chamfer(dist, W, D);
  // and how far each non-forest cell (water, clearing) is from the forest: foliage may overhang it by `overhang` cells
  const out = new Float32Array(W * D);
  for (let i = 0; i < W * D; i++) out[i] = ok[i] ? 0 : BIG;
  chamfer(out, W, D);
  const overhang = o.overhang ?? 2;
  const cellAt = (x, z) => (inArea(x, z) ? (x - x0) + (z - z0) * W : -1);
  const mask = (x, z) => (inArea(x, z) ? out[(x - x0) + (z - z0) * W] <= overhang && !inAvoid(x, z) : !clip);
  const leaves = o.leaves ?? LEAVES, flowers = list(o.flowers ?? ['flameFlower', 'yellowFlower']);
  const trees = [], emergents = [];
  // emergents first: their trunks punch through the canopy, canopy foliage then fills around them
  const eh = o.emergentHeight ?? [hMax + 18, hMax + 30];
  const fixed = Array.isArray(o.emergents) ? o.emergents : null, ne = fixed ? fixed.length : o.emergents ?? Math.round((W * D) / 2500);
  for (let k = 0, tries = 0; k < ne && tries < 300; tries++) {
    // random spots lean toward the back (−x/−z: the default camera looks from +x+z, emergents up front hide the canopy)
    const x = fixed ? fixed[k][0] : Math.round(x0 + 4 + (W - 9) * Math.pow(R(), 1.8)), z = fixed ? fixed[k][1] : Math.round(z0 + 4 + (D - 9) * Math.pow(R(), 1.8)), i = cellAt(x, z);
    if (fixed) k++;
    if (i < 0 || !ok[i]) continue;
    if (!fixed) {
      if (dist[i] < Math.min(9, 4 + 200 / (tries + 40)) || roomAvoid(x, z) < 10) continue;
      if (emergents.some((e) => Math.hypot(e.base[0] - x, e.base[2] - z) < 30 - tries * 0.06)) continue;
      k++;
    }
    const h = Math.round(R.range(eh[0], eh[1]));
    emergents.push(dipterocarp(g, [x, T.y[i] + 1, z], { height: h, crownRadius: clamp(h * 0.22, 9, 15), seed: R.int(0, 1e6), leaves, buttresses: R.int(4, 6), mask, bias: 0.14, flowers: R.chance(0.1) ? R.pick(flowers) : undefined, flowerAmount: 0.25 }));
  }
  // canopy: jittered grid, tallest drawn first (with 'keep' their sunlit tops win where crowns overlap)
  const density = o.density ?? 1, gaps = o.gaps ?? 0.25, flowering = o.flowering ?? 0.06;
  const sp = ((hMin + hMax) / 2) * 0.34 / Math.sqrt(density);
  const hAt = (x, z) => hMin + (hMax - hMin) * clamp(0.5 + 0.6 * N.fbm2(x * 0.035, z * 0.035, { octaves: 2 }) + R.range(-0.15, 0.15));
  const plan = [];
  for (let gz = z0 + sp * 0.4; gz <= z1; gz += sp) for (let gx = x0 + sp * 0.4; gx <= x1; gx += sp) {
    const x = Math.round(gx + R.range(-0.45, 0.45) * sp), z = Math.round(gz + R.range(-0.45, 0.45) * sp), i = cellAt(x, z);
    const seed = R.int(0, 1e6), rnd = R();
    if (i < 0 || !ok[i]) continue;
    const gap = (N.simplex2(x * 0.07 + 40, z * 0.07) + 1) / 2 > 1 - gaps * 0.6;
    let h = Math.round(hAt(x, z)), style = rng(seed).weighted([['round', 6], ['spreading', 1.5], ['tall', 1.2], ['layered', 1]]);
    // a mosaic of greens: most crowns near the base shades, some deep blue-green, some young yellow-green
    const tone = (seed % 1000) / 1000;
    let bias = (rnd - 0.65) * 0.2 + (tone < 0.16 ? -0.16 : tone > 0.9 ? 0.14 : 0);
    if (gap) { h = Math.round(h * (0.45 + 0.15 * rnd)); bias -= 0.12; style = 'round'; }
    let r = h * { round: 0.33, layered: 0.3, spreading: 0.36, tall: 0.22 }[style] * (1 + 0.2 * ((seed % 97) / 97));
    // taper toward forest edges (rivers, clearings, the border): lower, smaller crowns step down to the curtain
    h = Math.min(h, Math.round(12 + dist[i] * 2.2)); r = Math.min(r, roomAvoid(x, z) + 1.5, (dist[i] + overhang) / 1.15, h * 0.42);
    if (r < 2.5) continue;
    // at a seam (border: false) crowns are cut at the border: skip trunks so close to it that they'd stand bare
    if (clip && !border && Math.min(x - x0, x1 - x, z - z0, z1 - z) < r * 0.4) continue;
    plan.push({ x, z, y: T.y[i] + 1, h, style, r, bias, seed, flower: !gap && rnd < flowering, e: dist[i] });
  }
  // edge curtain: short dark crowns and leafy mounds along every forest edge
  const ed = o.edge ?? 7;
  if (ed > 0) for (let gz = z0 + 1; gz <= z1; gz += 5) for (let gx = x0 + 1; gx <= x1; gx += 5) {
    const x = Math.round(gx + R.range(-2, 2)), z = Math.round(gz + R.range(-2, 2)), i = cellAt(x, z);
    const seed = R.int(0, 1e6), rnd = R();
    if (i < 0 || !ok[i] || dist[i] > ed || roomAvoid(x, z) < 2) continue;
    if (dist[i] <= 3 && rnd < 0.5) plan.push({ x, z, y: T.y[i] + 1, mound: true, r: Math.min(2 + rnd * 2.4, dist[i] + 1.2), seed, h: 0 });
    else plan.push({ x, z, y: T.y[i] + 1, h: Math.round(7 + rnd * 6), style: 'round', r: Math.min(3 + rnd * 2, dist[i] + 1.5), bias: -0.14, seed, sub: true, e: dist[i] });
  }
  plan.sort((A, B) => B.h - A.h);
  for (const t of plan) {
    if (t.mound) { crown(g, [{ c: [t.x, t.y + t.r * 0.35, t.z], r: t.r, sq: 0.75, flat: 0.45, b: -0.12 }], { leaves, seed: t.seed, mask }); continue; }
    const res = jungleTree(g, [t.x, t.y, t.z], {
      height: t.h, style: t.style, crownRadius: t.r, crownDepth: t.sub ? 0.6 : 0.45 + (t.seed % 13) / 100, bias: t.bias, leaves, seed: t.seed, mask,
      trunk: o.trunk ?? (t.sub ? ['figRootDark', 'barkPaleDark'] : undefined), trunkRadius: t.e < 4 && t.r > 5 ? 0.9 : 0.5, roots: false, moss: false, roughness: 0.13,
      flowers: t.flower ? flowers[t.seed % flowers.length] : undefined, flowerAmount: 0.45,
    });
    if (!t.sub) trees.push(res);
  }
  let topY = -Infinity;
  for (const t of trees.concat(emergents)) topY = Math.max(topY, t.top[1]);
  return { trees, emergents, top: topY };
}

// ---- bamboo ------------------------------------------------------------------------------------------

/**
 * Bamboo clump: 8–20 ringed culms fanning out of a tight clump like a fountain, arching over at the tips, bare below
 * with feathery leaf sprays on the upper part. opts: height (14–24, 19), culms (8–20, 9–13), spread (clump radius, 1.6),
 * fan (max lean in degrees, 16), arch (tip droop 0..1, 0.5), stem (shades), node, leaf (shades), seed.
 * Returns { base, top, tips: [[x,y,z]…] }.
 */
export function bamboo(g, p, o = {}) {
  const R = R_(o);
  const [bx, by, bz] = p;
  const H = o.height ?? 19, n = o.culms ?? R.int(9, 13), spread = o.spread ?? 1.6, fan = ((o.fan ?? 16) * Math.PI) / 180, arch = o.arch ?? 0.5;
  const stems = list(o.stem ?? ['bambooDark', 'bamboo', 'bambooLight']), node = o.node ?? 'bambooNode';
  const leaf = list(o.leaf ?? ['bambooLeaf']);
  const tips = [];
  let topY = by;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU * 2.618 + R.range(-0.3, 0.3), d0 = Math.sqrt(R()) * spread;   // golden-angle spiral clump
    const outer = d0 / Math.max(0.01, spread);
    const L = H * R.range(0.75, 1.05) * (1 - 0.15 * outer), th = fan * (0.25 + 0.75 * outer) * R.range(0.8, 1.1);
    const ca = Math.cos(a), sa = Math.sin(a);
    // walk the culm in half-voxel steps: it leans out from the clump, the top arcs over
    let x = bx + ca * d0, y = by, z = bz + sa * d0;
    const cells = [];
    let last = null;
    for (let s = 0; s <= L; s += 0.5) {
      const bend = th + arch * 1.5 * Math.pow(Math.max(0, s / L - 0.7) / 0.3, 2);
      x += ca * Math.sin(bend) * 0.5; z += sa * Math.sin(bend) * 0.5; y += Math.cos(bend) * 0.5;
      const q = [Math.round(x), Math.round(y), Math.round(z)];
      if (last && q[0] === last[0] && q[1] === last[1] && q[2] === last[2]) continue;
      if (last && q[1] !== last[1] && (q[0] !== last[0] || q[2] !== last[2])) cells.push([last[0], q[1], last[2]]);   // keep it face-connected
      cells.push(q); last = q;
    }
    const m = stems[i % stems.length], every = R.int(3, 4), ph = R.int(0, 3);
    cells.forEach((q, k) => g.put(q[0], q[1], q[2], (k + ph) % every === 0 && k > 1 ? node : m, 'replace'));
    for (let k = 1; k <= 2; k++) g.put(cells[0][0], by - k, cells[0][2], m, 'keep');   // into the ground
    // feathery sprays at the upper nodes: a twig out sideways, leaves drooping off it
    const start = Math.floor(cells.length * 0.62);
    let alt = R.chance(0.5) ? 1 : -1;
    for (let k = start; k < cells.length; k++) {
      if ((k + ph) % every !== 0) continue;
      const q = cells[k], sa2 = a + (alt = -alt) * R.range(1.0, 1.9);
      const len = R.int(2, 3);
      for (let s = 1; s <= len; s++) {
        const lx = Math.round(q[0] + Math.cos(sa2) * s), lz = Math.round(q[2] + Math.sin(sa2) * s), ly = q[1] - Math.floor((s * s) / 4);
        g.put(lx, ly, lz, leaf[(s + k) % leaf.length], 'keep');
        if (s === len) g.put(lx, ly - 1, lz, leaf[0], 'keep');
      }
    }
    const tip = cells[cells.length - 1];
    for (let s = 1; s <= 2; s++) g.put(tip[0], tip[1] - s, tip[2], leaf[0], 'keep');   // drooping plume
    tips.push(tip); topY = Math.max(topY, ...cells.map((c) => c[1]));
  }
  return { base: [bx, by, bz], top: [bx, topY, bz], tips };
}

// ---- banana ------------------------------------------------------------------------------------------

/**
 * Banana plant: pseudo-stem 3–5 tall, 5–8 huge paddle leaves (rising petiole, wide blade drooping at the end, some
 * torn), a rolled young leaf, a dry leaf hanging on the stem, optional hanging bunch with a purple bud.
 * opts: height (stem, 3–5), leaves (count, 5–8), length (blade, 5–7), fruit (true | false | default 75%), leaf
 * (shades [old, young]), trunk, dry, seed. Returns { base, top, bunch }.
 */
export function banana(g, p, o = {}) {
  const R = R_(o);
  const [bx, by, bz] = p;
  const sh = o.height ?? R.int(3, 5), nl = o.leaves ?? R.int(5, 8);
  const leaf = list(o.leaf ?? ['bananaLeafDark', 'bananaLeaf']), trunk = o.trunk ?? 'bananaTrunk';
  for (let y = by - 2; y < by + sh; y++) g.put(bx, y, bz, trunk, y < by ? 'keep' : 'replace');
  for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) if (hash3(bx + dx, by, bz + dz, 2) < 0.6) g.put(bx + dx, by, bz + dz, trunk);   // swollen foot
  const ty = by + sh;
  g.put(bx, ty, bz, trunk); g.put(bx, ty + 1, bz, leaf[leaf.length - 1]); g.put(bx, ty + 2, bz, leaf[leaf.length - 1]);   // rolled young leaf
  const a0 = R() * TAU;
  let topY = ty + 2;
  for (let i = 0; i < nl; i++) {
    const a = a0 + i * 2.4 + R.range(-0.2, 0.2), age = i / Math.max(1, nl - 1);   // spiral; later = older, lower, droopier
    const L = o.length ?? R.int(5, 7), torn = R.chance(0.4);
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const m = leaf[age > 0.5 ? 0 : leaf.length - 1];
    // one curve: leaves the stem steeply (young) or flatter (old), bends over and droops at the tip; 2 wide past the petiole
    const e0 = (78 - age * 32) * Math.PI / 180, e1 = -(40 + age * 30) * Math.PI / 180, side = i % 2 ? 1 : -1;
    let x = bx, y = ty, z = bz, prev = [bx, ty, bz];
    const len = L + 2;
    for (let s = 0.5; s <= len; s += 0.5) {
      const t = s / len, el = e0 + (e1 - e0) * t * t;
      x += dx * Math.cos(el) * 0.5; y += Math.sin(el) * 0.5; z += dz * Math.cos(el) * 0.5;
      const q = [Math.round(x), Math.round(y), Math.round(z)];
      if (q[1] < by + 1) break;
      if (q[0] !== prev[0] || q[1] !== prev[1] || q[2] !== prev[2]) {
        g.line(prev, q, m, { mode: 'keep' });
        if (s > 2 && t < 0.94 && !(torn && hash3(i, Math.round(s), 7, 3) < 0.5)) g.put(Math.round(x + sx * side), q[1], Math.round(z + sz * side), m, 'keep');
        prev = q;
      }
      topY = Math.max(topY, q[1]);
    }
  }
  // dry dead leaf hanging down the stem
  if (o.dry !== false) { const a = a0 + 1.2, x = Math.round(bx + Math.cos(a)), z = Math.round(bz + Math.sin(a)); for (let y = ty; y >= by + 1; y--) g.put(x, y, z, o.dry ?? 'bananaDry', 'keep'); }
  // hanging bunch: stalk arcs out over the top, hands of fruit, purple bud at the end
  let bunch = null;
  if (o.fruit === true || (o.fruit !== false && R.chance(0.75))) {
    const a = a0 + Math.PI + R.range(-0.4, 0.4), x = Math.round(bx + Math.cos(a) * 2), z = Math.round(bz + Math.sin(a) * 2);
    g.line([bx, ty + 1, bz], [x, ty + 2, z], trunk, { mode: 'replace' });
    const fruit = o.fruitColor ?? 'bananaFruit', bud = o.bud ?? 'bananaFlower';
    for (let y = ty + 1; y >= ty - 1; y--) {
      g.put(x, y, z, trunk, 'replace');
      for (const [ex, ez] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (hash3(x + ex, y, z + ez, 6) < 0.8) g.put(x + ex, y, z + ez, fruit, 'keep');
    }
    g.put(x, ty - 2, z, trunk, 'replace');
    g.put(x, ty - 3, z, bud, 'replace'); if (ty - 4 > by) g.put(x, ty - 4, z, bud, 'replace');
    bunch = [x, ty, z];
  }
  return { base: [bx, by, bz], top: [bx, topY, bz], bunch };
}

// ---- drowned dead tree -------------------------------------------------------------------------------

/**
 * Bleached drowned tree standing in a reservoir (Cheow Lan): p = [x, waterY, z] (the water surface), trunk continues
 * down to the lake bed so it reads through the water; broken-off splintered top, 1–3 stubby bare branches, a dark
 * waterline ring. opts: height (above water, 6–20), bed (lake bed y, default waterY − 6), radius (0.6–1.5), branches
 * (1–3), lean, wood ([dark, mid]), wet (submerged / waterline material), seed.
 * Returns { base (at the bed), top, perch (a branch tip or the top: bird perch), branches: [[x,y,z]…] }.
 */
export function deadTree(g, p, o = {}) {
  const R = R_(o);
  const [bx, wy, bz] = p;
  const h = o.height ?? R.int(8, 18), bed = o.bed ?? wy - 6;
  const r = o.radius ?? clamp(h / 9, 1.1, 1.9);
  const wood = list(o.wood ?? ['deadWoodDark', 'deadWood']), wet = o.wet ?? 'deadWoodWet';
  const la = R() * TAU, lean = o.lean ?? R.range(0, 0.12);
  const cx = (y) => bx + Math.cos(la) * lean * Math.max(0, y - wy), cz = (y) => bz + Math.sin(la) * lean * Math.max(0, y - wy);
  const ring = R.int(1, 2);
  const mat = (x, y, z) => (y <= wy + ring ? wet : hash3(x, Math.floor((y + hash3(x, 0, z, 5) * 20) / 5), z, 6) < 0.18 ? wood[0] : wood[wood.length - 1]);
  const topY = wy + h;
  for (let y = bed; y <= topY; y++) {
    const t = clamp((y - wy) / h), rr = r * (1 - 0.35 * t) + (y < wy ? 0.15 : 0);
    const x0 = cx(y), z0 = cz(y);
    if (rr <= 0.55) { g.put(Math.round(x0), y, Math.round(z0), mat, 'replace'); continue; }
    // splintered top: the last few layers lose cells; one spike survives
    for (let z = Math.floor(z0 - rr); z <= Math.ceil(z0 + rr); z++) for (let x = Math.floor(x0 - rr); x <= Math.ceil(x0 + rr); x++) {
      if ((x - x0) ** 2 + (z - z0) ** 2 > rr * rr + 0.01) continue;
      const fromTop = topY - y;
      if (fromTop < 3 && hash3(x, 0, z, 9) * 3 > fromTop + 0.3) continue;
      g.put(x, y, z, mat, 'replace');
    }
  }
  // stubby bare branches (one may fork), upward-angled
  const nb = o.branches ?? R.int(1, 3), branches = [];
  for (let i = 0; i < nb; i++) {
    const y = Math.round(wy + h * R.range(0.35, 0.8)), a = R() * TAU, len = R.range(2.5, 5);
    const s = [cx(y), y, cz(y)], e = [s[0] + Math.cos(a) * (len + r), y + len * R.range(0.4, 0.9), s[2] + Math.sin(a) * (len + r)];
    g.line(s, e, wood[wood.length - 1], { r: 0.85, r2: 0.75 });   // ≥ 0.75: diagonal steps stay face-connected
    if (R.chance(0.4)) { const f = [e[0] + Math.cos(a + 0.8) * 2, e[1] + 1.5, e[2] + Math.sin(a + 0.8) * 2]; g.line(e, f, wood[wood.length - 1], { r: 0.78 }); }
    branches.push(e.map(Math.round));
  }
  // anchors are real voxels (the splintered top loses cells): the highest solid voxel near the point (stand at y + 1)
  const snap = ([x, y, z]) => {
    for (let yy = y + 1; yy >= bed; yy--) for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (g.get(x + dx, yy, z + dz)) return [x + dx, yy, z + dz];
    return [x, y, z];
  };
  const top = snap([Math.round(cx(topY)), topY, Math.round(cz(topY))]);
  const perch = branches.length ? snap(branches.reduce((A, B) => (B[1] > A[1] ? B : A))) : top;
  return { base: [bx, bed, bz], top, perch, branches };
}

// ---- registration (every exported generator needs one; test.mjs checks) ----
const J_ = (fn, summary, example, meta = {}) => defineGenerator(fn, { category: 'jungle', summary, example, ...meta });
J_(dipterocarp, 'emergent rainforest giant: pale trunk, plank buttresses, flat cauliflower crown', (g) => dipterocarp(g, [0, 1, 0], { height: 40, crownRadius: 11, seed: 3 }));
J_(strangler, 'strangler fig: hollow root lattice, aerial roots, dark crown with figs', (g) => strangler(g, [0, 1, 0], { height: 30, seed: 3 }));
J_(jungleTree, 'mid-canopy tree (style round | layered | spreading | tall, optional flowers)', (g) => { jungleTree(g, [-5, 1, -4], { height: 20, style: 'round', seed: 2 }); jungleTree(g, [6, 1, 5], { height: 16, style: 'spreading', flowers: 'flameFlower', seed: 4 }); });
J_(rainforest, 'dense layered rainforest canopy over an area (+ emergents, flowering crowns)', (g) => { g.box([-11, -1, -11], [11, 0, 11], 'grass'); rainforest(g, [-11, -11], [11, 11], { height: [12, 16], emergents: [[-4, -4]], emergentHeight: [27, 27], border: false, seed: 3 }); }, { ground: false });
J_(bamboo, 'bamboo clump: arching ringed culms, feathery leaf sprays', (g) => bamboo(g, [0, 1, 0], { seed: 3 }));
J_(banana, 'banana plant: paddle leaves, hanging bunch + purple bud', (g) => { banana(g, [-3, 1, -2], { seed: 3, fruit: true }); banana(g, [4, 1, 3], { seed: 5 }); });
J_(deadTree, 'bleached drowned tree standing in a lake (trunk down to the bed)', (g) => { g.box([-9, -4, -9], [9, -4, 9], 'sand'); g.box([-9, -3, -9], [9, 0, 9], 'water'); deadTree(g, [0, 0, 0], { bed: -3, height: 12, seed: 3 }); deadTree(g, [5, 0, 4], { bed: -3, height: 6, seed: 8 }); }, { ground: false });
