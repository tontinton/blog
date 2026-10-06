// Nature generators: trees, bushes, rocks, plants, clouds. They draw straight into a grid at a
// position and take material ids/names (or arrays = shades dark → light). Defaults use the NATURE
// material names, so the quickest start is:
//
//   const P = new Palette({ ...NATURE, ...yourOwn });
//   oak(g, [10, 4, 10], { height: 14, seed: 3 });
//   pine(g, [20, 4, 6], { height: 18 });
//   palm(g, [4, 4, 20], { lean: 0.4 });
//   rock(g, [14, 3, 22], { size: [5, 3, 4] });
//   scatter(g, (x, y, z, R) => R.chance(0.3) && grassTuft(g, [x, y, z], { R }), { on: ['grass'], density: 0.2 });
//   cloud(g, [0, 40, 0], { length: 18 });
//
// Every generator takes `seed` (or `R`, an rng) so results are repeatable, and `mode` ('keep' by
// default for foliage so it never overwrites trunks/buildings).
import { rng, noise, hash3, clamp } from '../random.js';
import { spline } from '../shapes.js';

/** Ready-made materials used by the generator defaults. Spread into your palette and override freely. */
export const NATURE = {
  bark: { color: '#6e4a2f', jitter: 0.06, noise: { color: '#553722', scale: 0.35, amount: 0.7 } },
  barkLight: { color: '#9b7b58', jitter: 0.05 },
  barkDark: { color: '#4a3020', jitter: 0.05 },
  leafDark: { color: '#2e6a33', jitter: 0.05, sway: 0.45 },
  leaf: { color: '#3f8a3c', jitter: 0.05, sway: 0.5 },
  leafLight: { color: '#62ad4a', jitter: 0.05, sway: 0.55 },
  pineDark: { color: '#1f4f3a', jitter: 0.05, sway: 0.25 },
  pine: { color: '#2d6b48', jitter: 0.05, sway: 0.3 },
  pineLight: { color: '#4a8f58', jitter: 0.05, sway: 0.35 },
  palmDark: { color: '#5c8f2e', jitter: 0.05, sway: 0.7 },
  palm: { color: '#7fb03c', jitter: 0.05, sway: 0.8 },
  palmLight: { color: '#a6cc5a', jitter: 0.05, sway: 0.9 },
  blossomDark: { color: '#c46d86', jitter: 0.05, sway: 0.45 },
  blossom: { color: '#e893aa', jitter: 0.05, sway: 0.5 },
  blossomLight: { color: '#f7c3d0', jitter: 0.04, sway: 0.55 },
  autumnDark: { color: '#b4502a', jitter: 0.05, sway: 0.45 },
  autumn: { color: '#de7a2e', jitter: 0.05, sway: 0.5 },
  autumnLight: { color: '#f2b04a', jitter: 0.05, sway: 0.55 },
  grassDark: { color: '#4f8f34', jitter: 0.05, sway: 1 },
  grass: { color: '#6aaa3e', jitter: 0.06, noise: { color: '#5b9a36', scale: 0.12, amount: 0.8 } },
  grassLight: { color: '#8fc451', jitter: 0.05, sway: 1 },
  dirt: { color: '#8a5d3b', jitter: 0.07, noise: { color: '#74492e', scale: 0.2, amount: 0.6 } },
  dirtDark: { color: '#5e3c26', jitter: 0.06 },
  stone: { color: '#8d8c88', jitter: 0.08, noise: { color: '#76756f', scale: 0.25, amount: 0.7 } },
  stoneDark: { color: '#5f5d5a', jitter: 0.07 },
  stoneLight: { color: '#b5b2aa', jitter: 0.06 },
  moss: { color: '#6f9a3e', jitter: 0.08 },
  sand: { color: '#e2cf98', jitter: 0.05, noise: { color: '#d4bd80', scale: 0.2, amount: 0.6 } },
  snow: { color: '#f4f7fb', jitter: 0.02, roughness: 0.7 },
  water: { color: '#2f9fb0', kind: 'water', opacity: 0.25 },
  cloud: { color: '#ffffff', jitter: 0.015, roughness: 1, bevel: 1.6, ao: 0.6 },
  cloudShade: { color: '#e7eaf2', jitter: 0.015, roughness: 1, bevel: 1.6, ao: 0.6 },
  petalRed: { color: '#e2454a', jitter: 0.04, sway: 0.6 },
  petalYellow: { color: '#f4cf45', jitter: 0.04, sway: 0.6 },
  petalWhite: { color: '#f6f2e8', jitter: 0.03, sway: 0.6 },
  petalPurple: { color: '#a77ad8', jitter: 0.04, sway: 0.6 },
  petalPink: { color: '#f29bc0', jitter: 0.04, sway: 0.6 },
  stem: { color: '#4f8a32', jitter: 0.05, sway: 0.8 },
  mushroom: { color: '#d8423a', jitter: 0.04 },
  mushroomStem: { color: '#efe6d4', jitter: 0.03 },
};

const list = (m) => (Array.isArray(m) ? m : [m]);
const shadeOf = (shades, t) => shades[clamp(Math.floor(t * shades.length), 0, shades.length - 1)];
const R_ = (o) => o.R ?? rng(o.seed ?? 1);

/** Fill the union of blobs [{ c:[x,y,z], r }] with noisy, height-shaded foliage. */
export function foliage(g, blobs, o = {}) {
  const shades = list(o.leaves ?? ['leafDark', 'leaf', 'leafLight']);
  const N = noise(o.seed ?? 7);
  const freq = o.freq ?? 0.28, amp = o.roughness ?? 0.35, holes = o.holes ?? 0;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const b of blobs) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.c[k] - b.r - 1); hi[k] = Math.max(hi[k], b.c[k] + b.r + 1); }
  const sq = o.squash ?? 1; // < 1 flattens vertically
  for (let y = Math.floor(lo[1]); y <= hi[1]; y++) for (let z = Math.floor(lo[2]); z <= hi[2]; z++) for (let x = Math.floor(lo[0]); x <= hi[0]; x++) {
    let d = Infinity;
    for (const b of blobs) {
      const dx = (x - b.c[0]) / b.r, dy = (y - b.c[1]) / (b.r * sq), dz = (z - b.c[2]) / b.r;
      d = Math.min(d, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    if (o.clipBelow != null && y < o.clipBelow) continue;
    const n = N.simplex3(x * freq, y * freq, z * freq);
    if (d + n * amp > 1) continue;
    if (holes && d < 0.75 && N.simplex3(x * 0.5 + 9, y * 0.5, z * 0.5) > 1 - holes) continue;
    const t = clamp((y - lo[1]) / Math.max(1, hi[1] - lo[1]) * 0.75 + (1 - d) * 0.15 + n * 0.25 + (hash3(x, y, z, 5) - 0.5) * 0.2 + (o.bias ?? 0));
    g.put(x, y, z, shadeOf(shades, t), o.mode ?? 'keep');
  }
  return g;
}

/** Round deciduous tree. opts: height, radius, trunk, leaves (shades), branches, lean, style 'blob'|'clumps', seed */
export function oak(g, p, o = {}) {
  const R = R_(o);
  const h = o.height ?? 12, r = o.radius ?? h * 0.4;
  const trunk = o.trunk ?? 'bark', tr = o.trunkRadius ?? Math.max(0.7, h / 11);
  const lean = o.lean ?? 0.15;
  const la = R() * Math.PI * 2;
  const top = [p[0] + Math.cos(la) * lean * h * 0.3, p[1] + h * 0.6, p[2] + Math.sin(la) * lean * h * 0.3];
  const mid = [p[0] + (R() - 0.5) * lean * h * 0.3, p[1] + h * 0.3, p[2] + (R() - 0.5) * lean * h * 0.3];
  g.tube([p, mid, top], trunk, { r: tr * 1.25, r2: tr * 0.8 });
  // root flare
  if (tr >= 0.9) for (let i = 0; i < 4; i++) { const a = la + (i * Math.PI) / 2; g.line(p, [p[0] + Math.cos(a) * tr * 2, p[1], p[2] + Math.sin(a) * tr * 2], trunk, { r: 0.6 }); }
  const blobs = [{ c: [top[0], top[1] + r * 0.35, top[2]], r }];
  const nb = o.branches ?? 3 + Math.floor(R() * 3);
  for (let i = 0; i < nb; i++) {
    const a = la + (i / nb) * Math.PI * 2 + R.range(-0.4, 0.4);
    const len = r * R.range(0.55, 0.85);
    const end = [top[0] + Math.cos(a) * len, top[1] + R.range(0.1, 0.6) * r, top[2] + Math.sin(a) * len];
    g.line(top, end, trunk, { r: tr * 0.7, r2: tr * 0.35 });
    blobs.push({ c: [end[0], end[1] + r * 0.2, end[2]], r: r * R.range(0.5, 0.7) });
  }
  if (o.style === 'clumps') {
    const clumps = [];
    for (const b of blobs) for (let i = 0; i < 4; i++) {
      const d = R.dir();
      clumps.push({ c: [b.c[0] + d[0] * b.r * 0.6, b.c[1] + Math.abs(d[1]) * b.r * 0.5, b.c[2] + d[2] * b.r * 0.6], r: b.r * R.range(0.45, 0.6) });
    }
    return foliage(g, clumps.concat(blobs.map((b) => ({ c: b.c, r: b.r * 0.7 }))), { ...o, roughness: o.roughness ?? 0.2, seed: R.int(0, 1e6) });
  }
  return foliage(g, blobs, { ...o, seed: R.int(0, 1e6), squash: o.squash ?? 0.85 });
}

/** Blossom / sakura style: twisty trunk, separated pink clumps. Same opts as oak. */
export function blossom(g, p, o = {}) {
  return oak(g, p, { leaves: ['blossomDark', 'blossom', 'blossomLight'], trunk: 'barkDark', lean: 0.5, style: 'clumps', holes: 0.25, branches: 5, ...o });
}

/** Low round bush (no trunk). opts: radius, leaves, squash */
export function bush(g, p, o = {}) {
  const R = R_(o);
  const r = o.radius ?? 2.5;
  const blobs = [{ c: [p[0], p[1] + r * 0.5, p[2]], r }];
  for (let i = 0; i < (o.lumps ?? 3); i++) { const a = R() * Math.PI * 2; blobs.push({ c: [p[0] + Math.cos(a) * r * 0.6, p[1] + r * 0.35, p[2] + Math.sin(a) * r * 0.6], r: r * R.range(0.55, 0.8) }); }
  return foliage(g, blobs, { squash: 0.75, ...o, seed: R.int(0, 1e6) });
}

/** Conifer: stacked drooping tiers. opts: height, radius, tiers, trunk, leaves (shades), snow (id: caps tiers) */
export function pine(g, p, o = {}) {
  const R = R_(o);
  const h = o.height ?? 16, r = o.radius ?? h * 0.28;
  const shades = list(o.leaves ?? ['pineDark', 'pine', 'pineLight']);
  const tiers = o.tiers ?? Math.max(3, Math.round(h / 4));
  const N = noise(R.int(0, 1e6));
  g.box(p, [p[0], p[1] + h - 1, p[2]], o.trunk ?? 'bark');
  const start = p[1] + Math.round(h * (o.bare ?? 0.18));
  const span = p[1] + h - start;
  for (let t = 0; t < tiers; t++) {
    const k = t / tiers;
    const base = start + Math.round(span * k * 0.92);
    const th = Math.max(2, Math.round((span / tiers) * 1.7));
    const rt = Math.max(1, r * (1 - k * 0.82));
    for (let dy = 0; dy < th; dy++) {
      const f = dy / th;
      const rr = rt * Math.pow(1 - f, 0.85) + 0.5;
      const y = base + dy;
      for (let dz = -Math.ceil(rr); dz <= Math.ceil(rr); dz++) for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) {
        const d = Math.hypot(dx, dz);
        const jag = N.simplex3((p[0] + dx) * 0.6, y * 0.6, (p[2] + dz) * 0.6) * 0.8;
        if (d > rr + jag) continue;
        // droop: the outer ring hangs one voxel lower
        const droop = d > rr * 0.75 && dy === 0 ? -1 : 0;
        const shade = clamp((d / (rr + 0.01)) * 0.55 + f * 0.35 + jag * 0.2 + (hash3(p[0] + dx, y, p[2] + dz, 3) - 0.5) * 0.25);
        g.put(p[0] + dx, y + droop, p[2] + dz, shadeOf(shades, shade), o.mode ?? 'keep');
        if (o.snow && dy === th - 1 - Math.floor(f) && d < rr * 0.9) g.put(p[0] + dx, y + 1, p[2] + dz, o.snow, 'keep');
      }
    }
  }
  g.box([p[0], p[1] + h, p[2]], [p[0], p[1] + h + 1, p[2]], shades[shades.length - 1], { mode: 'keep' });
  return g;
}

/** Palm tree: curved ringed trunk + drooping feathered fronds. opts: height, lean (0..1), fronds, length, trunk, ring, leaves, coconut */
export function palm(g, p, o = {}) {
  const R = R_(o);
  const h = o.height ?? 14, lean = o.lean ?? 0.35;
  const a = o.leanAngle ?? R() * Math.PI * 2;
  const dx = Math.cos(a), dz = Math.sin(a);
  const top = [p[0] + dx * lean * h * 0.55, p[1] + h, p[2] + dz * lean * h * 0.55];
  const ctrl = [p[0] + dx * lean * h * 0.08, p[1] + h * 0.5, p[2] + dz * lean * h * 0.08];
  const trunk = o.trunk ?? 'barkLight', ring = o.ring ?? 'bark';
  const path = spline([p, ctrl, top], 8);
  for (let i = 0; i < path.length - 1; i++) {
    const t = i / (path.length - 1);
    const m = (x, y) => (Math.floor(y) % 2 ? trunk : ring);
    g.line(path[i], path[i + 1], (x, y, z) => m(x, y), { r: 0.95 - t * 0.35, r2: 0.95 - (t + 1 / path.length) * 0.35 });
  }
  const shades = list(o.leaves ?? ['palmDark', 'palm', 'palmLight']);
  g.sphere(top, 1.2, shades[0]);
  const nf = o.fronds ?? 7, L = o.length ?? h * 0.55;
  for (let f = 0; f < nf; f++) {
    const fa = (f / nf) * Math.PI * 2 + R.range(-0.25, 0.25);
    const cx = Math.cos(fa), cz = Math.sin(fa);
    const lift = R.range(0.15, 0.45), len = L * R.range(0.85, 1.1);
    const steps = Math.ceil(len * 1.5);
    let prev = top;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const hd = t * len;
      const y = top[1] + len * lift * Math.sin(Math.PI * t * 0.9) - t * t * len * 0.45;
      const pt = [top[0] + cx * hd, y, top[2] + cz * hd];
      const shade = shadeOf(shades, clamp(0.3 + t * 0.6 + (hash3(f, s, 1) - 0.5) * 0.3));
      g.line(prev, pt, shade, { mode: 'keep' });
      // leaflets: short drooping strokes on both sides, longest mid-frond
      const w = Math.round(Math.sin(Math.PI * Math.min(1, t * 1.15)) * (o.width ?? 2.6));
      if (w > 0 && s % 1 === 0) for (const side of [-1, 1]) {
        const px = -cz * side, pz = cx * side;
        g.line(pt, [pt[0] + px * w, pt[1] - Math.max(1, w * 0.6), pt[2] + pz * w], shade, { mode: 'keep' });
      }
      prev = pt;
    }
  }
  if (o.coconut !== false) for (let i = 0; i < 3; i++) { const ca = a + (i * Math.PI * 2) / 3; g.put(top[0] + Math.cos(ca), top[1] - 1, top[2] + Math.sin(ca), o.coconut ?? 'barkDark', 'keep'); }
  return g;
}

/** Bare branching tree (dead / winter / bonsai skeleton). opts: height, depth, spread, trunk, tips (id for twig ends) */
export function branches(g, p, o = {}) {
  const R = R_(o);
  const h = o.height ?? 12, depth = o.depth ?? 4, spread = o.spread ?? 0.8, trunk = o.trunk ?? 'bark';
  const grow = (from, dir, len, r, d) => {
    const to = [from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len];
    g.line(from, to, trunk, { r, r2: r * 0.7 });
    if (d <= 0) { if (o.tips) g.put(to[0], to[1], to[2], o.tips, 'keep'); return; }
    const n = R.chance(0.3) ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, tilt = spread * R.range(0.5, 1);
      const nd = [dir[0] + Math.cos(a) * tilt, dir[1] + 0.3, dir[2] + Math.sin(a) * tilt];
      const l = Math.hypot(...nd);
      grow(to, nd.map((v) => v / l), len * R.range(0.6, 0.78), Math.max(0.5, r * 0.7), d - 1);
    }
  };
  grow(p, [0, 1, 0], h * 0.4, o.trunkRadius ?? Math.max(0.7, h / 14), depth);
  return g;
}

/** Willow: canopy plus hanging strands. opts like oak + strands (count), strandLength */
export function willow(g, p, o = {}) {
  const R = R_(o);
  const h = o.height ?? 12, r = o.radius ?? h * 0.45;
  oak(g, p, { ...o, R, height: h, radius: r, squash: 0.6 });
  const shades = list(o.leaves ?? ['leafDark', 'leaf', 'leafLight']);
  const n = o.strands ?? Math.round(r * r * 1.6);
  const cy = p[1] + h * 0.6 + r * 0.35;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = r * R.range(0.65, 1.05);
    const x = Math.round(p[0] + Math.cos(a) * d), z = Math.round(p[2] + Math.sin(a) * d);
    const y0 = Math.round(cy - r * 0.2);
    const len = Math.round((o.strandLength ?? h * 0.45) * R.range(0.5, 1));
    for (let y = y0; y > y0 - len && y > p[1]; y--) g.put(x, y, z, shadeOf(shades, R() * 0.8 + 0.2), 'keep');
  }
  return g;
}

/** Faceted boulder. opts: size [x,y,z] (or radius), stone (shades), moss (id painted on top), bury (0..1), facet (quantization) */
export function rock(g, p, o = {}) {
  const R = R_(o);
  const s = o.size ?? [o.radius ?? 3, (o.radius ?? 3) * 0.75, o.radius ?? 3];
  const shades = list(o.stone ?? ['stoneDark', 'stone', 'stoneLight']);
  const N = noise(R.int(0, 1e6));
  const facet = o.facet ?? 0.35, bury = o.bury ?? 0.25;
  const cy = p[1] + s[1] * (1 - bury) - 0.5;
  for (let y = Math.floor(cy - s[1]) - 1; y <= cy + s[1] + 1; y++) for (let z = Math.floor(p[2] - s[2]) - 1; z <= p[2] + s[2] + 1; z++) for (let x = Math.floor(p[0] - s[0]) - 1; x <= p[0] + s[0] + 1; x++) {
    if (y < p[1]) continue;
    const dx = (x - p[0]) / s[0], dy = (y - cy) / s[1], dz = (z - p[2]) / s[2];
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let n = N.simplex3(x * 0.18, y * 0.18, z * 0.18) * 0.35 + N.simplex3(x * 0.45, y * 0.45, z * 0.45) * 0.12;
    if (facet) n = Math.round(n / facet) * facet * 0.8 + n * 0.2;
    if (d + n > 1) continue;
    const top = !(1 > Math.sqrt(dx * dx + ((y + 1 - cy) / s[1]) ** 2 + dz * dz) + n) || y >= cy + s[1] * 0.6;
    const t = clamp((y - (cy - s[1])) / (2 * s[1]) * 0.6 + N.simplex3(x * 0.3, y * 0.3, z * 0.3) * 0.3 + 0.2);
    g.put(x, y, z, o.moss && top && N.simplex3(x * 0.25, z * 0.25, 3) > -0.1 ? o.moss : shadeOf(shades, t), o.mode ?? 'replace');
  }
  return g;
}

/** Visit air cells sitting on top of matching voxels: fn(x, y, z, R, belowId). opts: on (ids/names), density 0..1, area [[x0,z0],[x1,z1]], seed */
export function scatter(g, fn, o = {}) {
  const R = R_(o);
  const on = o.on ? new Set(list(o.on).map((m) => g.mat(m))) : null;
  const density = o.density ?? 0.1;
  const spots = [];
  g.surface((x, y, z, id) => {
    if (on && !on.has(id)) return;
    if (o.area && (x < o.area[0][0] || z < o.area[0][1] || x > o.area[1][0] || z > o.area[1][1])) return;
    if (hash3(x, y, z, o.seed ?? 11) < density) spots.push([x, y + 1, z, id]);
  });
  for (const [x, y, z, id] of spots) fn(x, y, z, R, id);
  return spots.length;
}

/** 1–3 voxel grass blades. opts: height, shades */
export function grassTuft(g, p, o = {}) {
  const R = R_(o);
  const h = o.height ?? R.int(1, 3);
  const shades = list(o.shades ?? ['grassDark', 'grassLight']);
  for (let i = 0; i < h; i++) g.put(p[0], p[1] + i, p[2], shadeOf(shades, i / Math.max(1, h)), 'keep');
  return g;
}

/** Flower: stem + head. opts: height, petal (id), center (id), stem (id), shape 'plus'|'dot'|'cup' */
export function flower(g, p, o = {}) {
  const R = R_(o);
  const h = o.height ?? R.int(1, 3);
  const stem = o.stem ?? 'stem', petal = o.petal ?? R.pick(['petalRed', 'petalYellow', 'petalWhite', 'petalPurple', 'petalPink']);
  for (let i = 0; i < h; i++) g.put(p[0], p[1] + i, p[2], stem, 'keep');
  const y = p[1] + h;
  const shape = o.shape ?? 'plus';
  if (shape === 'dot') g.put(p[0], y, p[2], petal, 'keep');
  else {
    g.put(p[0], y, p[2], o.center ?? petal, 'keep');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.put(p[0] + dx, y + (shape === 'cup' ? 1 : 0), p[2] + dz, petal, 'keep');
  }
  return g;
}

/** Mushroom: stem + dome cap. opts: height, radius, cap, stem, dots (id) */
export function mushroom(g, p, o = {}) {
  const h = o.height ?? 2, r = o.radius ?? 1.5;
  g.box(p, [p[0], p[1] + h - 1, p[2]], o.stem ?? 'mushroomStem');
  g.ellipsoid([p[0], p[1] + h, p[2]], [r, r * 0.7, r], (x, y, z) => (y < p[1] + h ? 0 : o.dots && hash3(x, y, z, 2) < 0.18 ? o.dots : o.cap ?? 'mushroom'), { mode: 'keep' });
  return g;
}

/** Reeds / cattails. opts: count, height, area radius, stem, tip */
export function reeds(g, p, o = {}) {
  const R = R_(o);
  for (let i = 0; i < (o.count ?? 6); i++) {
    const [dx, dz] = R.disc();
    const x = Math.round(p[0] + dx * (o.radius ?? 2)), z = Math.round(p[2] + dz * (o.radius ?? 2));
    const h = R.int(2, o.height ?? 5);
    for (let y = 0; y < h; y++) g.put(x, p[1] + y, z, o.stem ?? 'grassDark', 'keep');
    if (o.tip !== false && R.chance(0.6)) g.put(x, p[1] + h, z, o.tip ?? 'barkDark', 'keep');
  }
  return g;
}

/** Puffy cloud: overlapping flattened spheres with a flat-ish base. opts: length, height, depth, shades, seed */
export function cloud(g, p, o = {}) {
  const R = R_(o);
  const L = o.length ?? 16, H = o.height ?? L * 0.35, D = o.depth ?? L * 0.5;
  const n = o.puffs ?? Math.max(3, Math.round(L / 3.5));
  const blobs = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const big = Math.sin(Math.PI * t);
    const r = (H * 0.45 + H * 0.55 * big) * R.range(0.8, 1.1);
    blobs.push({ c: [p[0] + (t - 0.5) * L, p[1] + r * 0.45, p[2] + R.range(-0.3, 0.3) * D], r });
  }
  for (let i = 0; i < Math.round(n / 2); i++) blobs.push({ c: [p[0] + R.range(-0.35, 0.35) * L, p[1] + H * 0.3, p[2] + R.sign() * D * 0.3], r: H * R.range(0.4, 0.6) });
  const shades = list(o.shades ?? ['cloudShade', 'cloud']);
  return foliage(g, blobs, { leaves: shades, roughness: o.roughness ?? 0.12, freq: 0.15, squash: 0.85, seed: R.int(0, 1e6), mode: 'keep', bias: 0.25, clipBelow: p[1] });
}

/** Chimney smoke: a drifting column of shrinking-then-growing puffs. opts: height, drift [dx,dz], puffs, shades */
export function smoke(g, p, o = {}) {
  const R = R_(o);
  const H = o.height ?? 10, n = o.puffs ?? 4;
  const drift = o.drift ?? [0.4, 0.2];
  const blobs = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    blobs.push({ c: [p[0] + drift[0] * H * t, p[1] + 1 + H * t, p[2] + drift[1] * H * t], r: 1.2 + t * (o.spread ?? 2.2) * R.range(0.8, 1.2) });
  }
  return foliage(g, blobs, { leaves: list(o.shades ?? ['cloudShade', 'cloud']), roughness: 0.15, freq: 0.3, seed: R.int(0, 1e6), mode: 'keep', bias: 0.3 });
}

/** Paint moss/snow/ivy-like cover on the top faces of matching voxels using noise. opts: on, with (id), amount (0..1), scale, depth */
export function cover(g, o = {}) {
  const N = noise(o.seed ?? 21);
  const on = o.on ? new Set(list(o.on).map((m) => g.mat(m))) : null;
  const amount = o.amount ?? 0.5, sc = o.scale ?? 0.15, depth = o.depth ?? 1;
  const hits = [];
  g.surface((x, y, z, id) => {
    if (on && !on.has(id)) return;
    const n = (N.fbm2(x * sc, z * sc + y * 0.3, { octaves: 3 }) + 1) / 2 + (hash3(x, y, z, 4) - 0.5) * 0.15;
    if (n < amount) hits.push([x, y, z]);
  });
  for (const [x, y, z] of hits) for (let d = 0; d < depth; d++) if (g.get(x, y - d, z)) g.set(x, y - d, z, g.mat(o.with ?? 'moss'));
  return g;
}

/** Vines hanging down the sides of matching voxels. opts: on, with (id or shades), density, length */
export function vines(g, o = {}) {
  const R = R_(o);
  const shades = list(o.with ?? ['leafDark', 'leaf']);
  const on = o.on ? new Set(list(o.on).map((m) => g.mat(m))) : null;
  const starts = [];
  g.forEach((x, y, z, id) => {
    if (on && !on.has(id)) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g.get(x + dx, y, z + dz) && !g.get(x + dx, y + 1, z + dz) && hash3(x * 3 + dx, y, z * 3 + dz, 9) < (o.density ?? 0.04)) starts.push([x + dx, y, z + dz]);
  });
  for (const [x, y, z] of starts) {
    const len = R.int(2, o.length ?? 6);
    for (let i = 0; i < len; i++) { if (g.get(x, y - i, z)) break; g.set(x, y - i, z, g.mat(shadeOf(shades, R()))); }
  }
  return g;
}

/** Waterfall: a sheet of water falling from `top` down to `bottomY`, with foam at the base. opts: width (3), depth (1), water, foam, axis ('x' sheet spans x) */
export function waterfall(g, top, bottomY, o = {}) {
  const w = o.width ?? 3, d = o.depth ?? 1, alongX = (o.axis ?? 'x') === 'x';
  for (let y = bottomY; y <= top[1]; y++) for (let i = 0; i < w; i++) for (let k = 0; k < d; k++) {
    const x = alongX ? top[0] + i : top[0] + k, z = alongX ? top[2] + k : top[2] + i;
    g.put(x, y, z, o.water ?? 'water', o.mode ?? 'keep');
  }
  if (o.foam !== false) for (let i = -1; i <= w; i++) for (let k = -1; k <= d; k++) {
    const x = alongX ? top[0] + i : top[0] + k, z = alongX ? top[2] + k : top[2] + i;
    if (hash3(x, bottomY, z, 3) < 0.7) g.put(x, bottomY, z, o.foam ?? 'cloud', 'replace');
  }
  return g;
}
