// Architecture + props: walls with openings, houses, fences, stairs, lamps, wells, lattice trusses,
// lit window facades, crates, barrels and furniture. Sides are named by the outward direction:
// '+x' | '-x' | '+z' | '-z' ('+z' faces the default camera). Ranges are inclusive.
//
//   const P = new Palette({ ...NATURE, ...BUILD });
//   house(g, [0, 1, 0], { w: 11, d: 9, h: 6, roof: 'roofTile', door: { side: '+z' }, windows: 2, chimney: true });
//   fence(g, [[-12, 1, 12], [12, 1, 12]], { every: 3 });
//   lamppost(g, [8, 1, 12]);   truss(g, [0, 0, 0], [0, 30, 0], 'metal');   bookshelf(g, [2, 1, 1], { w: 5, h: 6 });
import { rng, hash3, clamp } from '../random.js';

export const BUILD = {
  plank: { color: '#a8743f', jitter: 0.06, noise: { color: '#946234', scale: 0.4, amount: 0.6 } },
  plankDark: { color: '#6d4526', jitter: 0.06 },
  plankLight: { color: '#c79a62', jitter: 0.05 },
  beam: { color: '#5a3a22', jitter: 0.05 },
  plaster: { color: '#efe4cf', jitter: 0.03 },
  brick: { color: '#a8513a', jitter: 0.1, grid: 0.5 },
  stoneBrick: { color: '#8f8a84', jitter: 0.1, grid: 0.55 },
  cobble: { colors: ['#7e7a74', '#8f8b84', '#6d6a64'], jitter: 0.06, grid: 0.3 },
  roofTile: { color: '#b4553e', jitter: 0.07, gradient: { color: '#8e3e2e', axis: 'y', from: 20, to: 0, amount: 0.5 } },
  roofTileDark: { color: '#7d3a2b', jitter: 0.06 },
  roofSlate: { color: '#55606e', jitter: 0.07 },
  thatch: { color: '#c9a45a', jitter: 0.08, noise: { color: '#a8823e', scale: 0.3 } },
  door: { color: '#6b3f22', jitter: 0.03 },
  glass: { color: '#9fd3e6', kind: 'glass', opacity: 0.15 },
  window: { color: '#2a3a4a', roughness: 0.2, jitter: 0.02 },
  windowLit: { color: '#ffd38a', emissive: 3, light: { radius: 6, intensity: 0.8 } },
  lamp: { color: '#ffd28a', emissive: 5, light: { radius: 8, intensity: 1.2 } },
  candle: { color: '#ffcf7a', emissive: 6, flicker: 0.4, flickerSpeed: 1.3, light: { color: '#ffb35a', radius: 6, intensity: 1 } },
  fire: { colors: ['#ff7a1a', '#ffb43a', '#ff5010'], emissive: 7, flicker: 0.6, flickerSpeed: 1.6, light: { color: '#ff8a3a', radius: 9, intensity: 1.5 } },
  metal: { color: '#6f7780', metalness: 0.6, roughness: 0.45, jitter: 0.04 },
  metalDark: { color: '#3d434b', metalness: 0.5, roughness: 0.5, jitter: 0.04 },
  gold: { color: '#e6b84a', metalness: 1, roughness: 0.3, jitter: 0.03 },
  concrete: { color: '#9a9aa2', jitter: 0.06, noise: { color: '#86868f', scale: 0.2, amount: 0.6 } },
  fabric: { color: '#7fa6c8', jitter: 0.03, roughness: 1 },
  fabricRed: { color: '#b84a4a', jitter: 0.03, roughness: 1 },
  paper: { color: '#efe6cf', jitter: 0.02 },
  neonCyan: { color: '#3ef0ff', emissive: 5, light: { radius: 6, intensity: 0.9 } },
  neonPink: { color: '#ff4fb8', emissive: 5, light: { radius: 6, intensity: 0.9 } },
  neonYellow: { color: '#ffe05a', emissive: 4, light: { radius: 5, intensity: 0.7 } },
};

const SIDES = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
const R_ = (o) => o.R ?? rng(o.seed ?? 1);

/**
 * Rectangular walls between corners a=[x0,y0,z0] and b=[x1,y1,z1] (y1 = top course). Hollow inside.
 * opts: floor (id), ceiling (id), posts (id at corners), beam (id for the top course), base (id for the bottom course),
 *       openings [{ side, at (offset from the wall's start, default centered), w, h, y (above y0), fill (id; 0 = hole), frame (id) }]
 */
export function walls(g, a, b, m, o = {}) {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])], [z0, z1] = [Math.min(a[2], b[2]), Math.max(a[2], b[2])];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const edgeX = x === x0 || x === x1, edgeZ = z === z0 || z === z1;
    if (!edgeX && !edgeZ) continue;
    let id = m;
    if (o.base && y === y0) id = o.base;
    if (o.beam && y === y1) id = o.beam;
    if (o.posts && edgeX && edgeZ) id = o.posts;
    g.put(x, y, z, id, o.mode);
  }
  if (o.floor) g.box([x0, y0 - 1, z0], [x1, y0 - 1, z1], o.floor);
  if (o.ceiling) g.box([x0, y1 + 1, z0], [x1, y1 + 1, z1], o.ceiling);
  for (const op of o.openings ?? []) opening(g, [x0, y0, z0], [x1, y1, z1], op);
  return g;
}

/** Cut (and optionally fill/frame) an opening in a wall of the box lo..hi. */
export function opening(g, lo, hi, op) {
  const [sx, sz] = SIDES[op.side ?? '+z'];
  const alongX = sz !== 0;
  const len = alongX ? hi[0] - lo[0] + 1 : hi[2] - lo[2] + 1;
  const w = op.w ?? 1, h = op.h ?? 1;
  const at = op.at ?? Math.floor((len - w) / 2);
  const y = lo[1] + (op.y ?? 0);
  const fixed = sx > 0 ? hi[0] : sx < 0 ? lo[0] : sz > 0 ? hi[2] : lo[2];
  for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) {
    const along = (alongX ? lo[0] : lo[2]) + at + i;
    const x = alongX ? along : fixed, z = alongX ? fixed : along;
    const inside = i >= 0 && i < w && j >= 0 && j < h;
    if (inside) g.set(x, y + j, z, g.mat(op.fill ?? 0));
    else if (op.frame && g.get(x, y + j, z)) g.set(x, y + j, z, g.mat(op.frame));
  }
  if (op.sill) for (let i = 0; i < w; i++) {
    const along = (alongX ? lo[0] : lo[2]) + at + i;
    g.put(alongX ? along : fixed + sx, y - 1, alongX ? fixed + sz : along, op.sill, 'keep');
  }
  return g;
}

/**
 * Simple house. p = min corner [x, y, z] of the footprint (y = floor level). opts:
 *   w, d, h (wall height), wall, posts, beam, base, floor, roof, roofType ('gable'|'hip'|'shed'|'flat'), overhang, slope,
 *   gable (id for the gable triangles, defaults to wall), door { side, at, w, h, m }, windows (count per long side) | [{ side, at, y, w, h }],
 *   window (fill id, 'window'), windowFrame, lit (0..1 chance a window glows with 'windowLit'), chimney (true | { at: [dx, dz], m, h }), seed
 * Returns the roof's ridge height.
 */
export function house(g, p, o = {}) {
  const R = R_(o);
  const w = o.w ?? 9, d = o.d ?? 7, h = o.h ?? 5;
  const wall = o.wall ?? 'plaster';
  const lo = [p[0], p[1], p[2]], hi = [p[0] + w - 1, p[1] + h - 1, p[2] + d - 1];
  walls(g, lo, hi, wall, { posts: o.posts ?? 'beam', beam: o.beam ?? 'beam', base: o.base, floor: o.floor ?? 'plankDark' });
  const openings = [];
  const door = o.door === false ? null : { side: '+z', w: 2, h: 3, ...(o.door ?? {}) };
  if (door) openings.push({ ...door, fill: door.m ?? 'door', frame: o.doorFrame });
  const winFill = o.window ?? 'window';
  const lit = (i) => (o.lit && R() < o.lit ? 'windowLit' : winFill);
  if (Array.isArray(o.windows)) for (const wd of o.windows) openings.push({ y: 2, w: 2, h: 2, fill: lit(), frame: o.windowFrame, sill: o.sill, ...wd });
  else {
    const n = o.windows ?? 2;
    for (const side of ['+z', '-z', '+x', '-x']) {
      const len = side.endsWith('z') ? w : d;
      const count = side.endsWith('z') ? n : Math.max(1, n - 1);
      for (let i = 0; i < count; i++) {
        const at = Math.round(((i + 1) * len) / (count + 1)) - 1;
        if (door && door.side === side && Math.abs(at - (door.at ?? Math.floor((len - 2) / 2))) < 3) continue;
        openings.push({ side, at, y: 2, w: 2, h: 2, fill: lit(i), frame: o.windowFrame, sill: o.sill });
      }
    }
  }
  for (const op of openings) opening(g, lo, hi, op);
  const roof = o.roof ?? 'roofTile';
  const ry = p[1] + h;
  g.roof([lo[0], ry, lo[2]], [hi[0], ry, hi[2]], roof, { type: o.roofType ?? 'gable', overhang: o.overhang ?? 1, slope: o.slope ?? 1, gable: o.gable ?? wall, ridge: o.ridge, axis: o.axis });
  if (o.chimney) {
    const c = o.chimney === true ? {} : o.chimney;
    const at = c.at ?? [Math.round(w * 0.75), Math.round(d * 0.35)];
    const top = ry + Math.ceil(Math.min(w, d) / 2) + (c.h ?? 3);
    g.box([p[0] + at[0], ry - 1, p[2] + at[1]], [p[0] + at[0] + 1, top, p[2] + at[1] + 1], c.m ?? 'stoneBrick');
    return { ridge: ry + Math.ceil(Math.min(w, d) / 2), chimneyTop: [p[0] + at[0], top + 1, p[2] + at[1]] };
  }
  return { ridge: ry + Math.ceil(Math.min(w, d) / 2) };
}

/** Fence along a polyline of [x, y, z] points (y: ground level; posts stand on it). opts: post, rail, height (2), every (3), rails ([1, 2]) */
export function fence(g, pts, o = {}) {
  const post = o.post ?? 'plankDark', rail = o.rail ?? 'plank', h = o.height ?? 2, every = o.every ?? 3;
  const rails = o.rails ?? (h >= 2 ? [h - 1, Math.max(0, h - 2)] : [0]);
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s], b = pts[s + 1];
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[2] - a[2]));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(a[0] + ((b[0] - a[0]) * i) / n), z = Math.round(a[2] + ((b[2] - a[2]) * i) / n), y = Math.round(a[1] + ((b[1] - a[1]) * i) / n);
      if (i % every === 0) g.box([x, y, z], [x, y + h, z], post);
      else for (const r of rails) g.put(x, y + r, z, rail, o.mode ?? 'keep');
    }
  }
  return g;
}

/** Straight stairs climbing toward `dir` ('+x'|'-x'|'+z'|'-z') from p. opts: width (1), rise per step (1), fill (solid underneath, true), side (id for stringers) */
export function stairs(g, p, dir, steps, m, o = {}) {
  const [dx, dz] = SIDES[dir];
  const w = o.width ?? 1, rise = o.rise ?? 1;
  for (let s = 0; s < steps; s++) for (let k = 0; k < w; k++) {
    const x = p[0] + dx * s + (dz ? k : 0), z = p[2] + dz * s + (dx ? k : 0);
    const top = p[1] + s * rise + rise - 1;
    for (let y = o.fill === false ? top : p[1]; y <= top; y++) g.put(x, y, z, o.side && (k === 0 || k === w - 1) && y < top ? o.side : m, o.mode);
  }
  return g;
}

/** Ladder against a wall: rails + rungs. p = bottom, h = height, facing side toward the wall. */
export function ladder(g, p, h, m = 'plankDark', o = {}) {
  const alongX = (o.axis ?? 'x') === 'x';
  for (let y = 0; y < h; y++) {
    g.put(p[0], p[1] + y, p[2], m);
    g.put(p[0] + (alongX ? 2 : 0), p[1] + y, p[2] + (alongX ? 0 : 2), m);
    if (y % 2 === 1) g.put(p[0] + (alongX ? 1 : 0), p[1] + y, p[2] + (alongX ? 0 : 1), m);
  }
  return g;
}

/** Street lamp. opts: height (5), pole, lamp (emissive id), arm (side, or false for a top lamp), cap */
export function lamppost(g, p, o = {}) {
  const h = o.height ?? 5, pole = o.pole ?? 'metalDark', lamp = o.lamp ?? 'lamp';
  g.box(p, [p[0], p[1] + h - 1, p[2]], pole);
  if (o.arm) {
    const [dx, dz] = SIDES[o.arm];
    g.put(p[0] + dx, p[1] + h - 1, p[2] + dz, pole);
    g.put(p[0] + dx * 2, p[1] + h - 1, p[2] + dz * 2, pole);
    g.put(p[0] + dx * 2, p[1] + h - 2, p[2] + dz * 2, lamp);
  } else {
    g.put(p[0], p[1] + h, p[2], lamp);
    g.put(p[0], p[1] + h + 1, p[2], o.cap ?? pole);
  }
  return g;
}

/** Stone well with a little roof. opts: radius, wall, water, post, roof */
export function well(g, p, o = {}) {
  const r = o.radius ?? 2.2;
  g.cylinder(p, r, 3, o.wall ?? 'stoneBrick', { hollow: 1 });
  g.disc([p[0], p[1], p[2]], r - 1, o.water ?? 'water');
  const s = Math.ceil(r);
  g.box([p[0] - s, p[1] + 3, p[2]], [p[0] - s, p[1] + 6, p[2]], o.post ?? 'beam');
  g.box([p[0] + s, p[1] + 3, p[2]], [p[0] + s, p[1] + 6, p[2]], o.post ?? 'beam');
  g.box([p[0] - s, p[1] + 6, p[2]], [p[0] + s, p[1] + 6, p[2]], o.post ?? 'beam');
  g.roof([p[0] - s, p[1] + 7, p[2] - 1], [p[0] + s, p[1] + 7, p[2] + 1], o.roof ?? 'roofSlate', { axis: 'x', overhang: 1 });
  return g;
}

/** Lattice girder from a to b (square section, X-bracing) — cranes, towers, bridges. opts: size (4), brace (id), every (size) */
export function truss(g, a, b, m = 'metal', o = {}) {
  const s = (o.size ?? 4) - 1;
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2]));
  const ax = Math.abs(d[0]) === len ? 0 : Math.abs(d[1]) === len ? 1 : 2;
  const u = (ax + 1) % 3, v = (ax + 2) % 3;
  const P = (t, du, dv) => { const q = [a[0] + (d[0] * t) / len, a[1] + (d[1] * t) / len, a[2] + (d[2] * t) / len]; q[u] += du; q[v] += dv; return q; };
  for (const [du, dv] of [[0, 0], [s, 0], [0, s], [s, s]]) g.line(P(0, du, dv), P(len, du, dv), m, { mode: o.mode });
  const every = o.every ?? s + 1;
  for (let t = 0; t + every <= len; t += every) {
    const br = o.brace ?? m;
    g.line(P(t, 0, 0), P(t + every, s, 0), br); g.line(P(t, 0, s), P(t + every, s, s), br);
    g.line(P(t, 0, 0), P(t + every, 0, s), br); g.line(P(t, s, 0), P(t + every, s, s), br);
    const ring = [[0, 0], [s, 0], [s, s], [0, s]];
    for (let k = 0; k < 4; k++) g.line(P(t, ...ring[k]), P(t, ...ring[(k + 1) % 4]), br);
  }
  return g;
}

/**
 * Grid of windows on a flat facade. a/b = inclusive corners of the facade rectangle (one axis constant).
 * opts: every [sx, sy] spacing (3, 3), size [w, h] (1, 1), window (unlit id), lit (id or [ids]), chance (lit probability 0.6), seed, frame
 */
export function facade(g, a, b, o = {}) {
  const R = R_(o);
  const lo = [0, 1, 2].map((i) => Math.min(a[i], b[i])), hi = [0, 1, 2].map((i) => Math.max(a[i], b[i]));
  const flat = lo[0] === hi[0] ? 0 : 2;
  const along = flat === 0 ? 2 : 0;
  const [ex, ey] = o.every ?? [3, 3], [ww, wh] = o.size ?? [1, 1];
  const lit = Array.isArray(o.lit) ? o.lit : [o.lit ?? 'windowLit'];
  for (let y = lo[1] + (o.offset?.[1] ?? 1); y + wh - 1 <= hi[1]; y += ey) for (let s = lo[along] + (o.offset?.[0] ?? 1); s + ww - 1 <= hi[along]; s += ex) {
    const m = R() < (o.chance ?? 0.6) ? R.pick(lit) : o.window ?? 'window';
    for (let i = 0; i < ww; i++) for (let j = 0; j < wh; j++) {
      const q = [0, 0, 0]; q[flat] = lo[flat]; q[along] = s + i; q[1] = y + j;
      g.set(q[0], q[1], q[2], g.mat(m));
    }
  }
  return g;
}

/** Wooden crate with darker edges. opts: size (2), m, edge */
export function crate(g, p, o = {}) {
  const s = (o.size ?? 2) - 1;
  g.box(p, [p[0] + s, p[1] + s, p[2] + s], (x, y, z) => {
    const e = [x === p[0] || x === p[0] + s, y === p[1] || y === p[1] + s, z === p[2] || z === p[2] + s].filter(Boolean).length >= 2;
    return e ? o.edge ?? 'plankDark' : o.m ?? 'plank';
  });
  return g;
}

/** Barrel: banded cylinder. opts: height (3), radius (1.2), m, band */
export function barrel(g, p, o = {}) {
  const h = o.height ?? 3;
  g.cylinder(p, o.radius ?? 1.2, h, (x, y) => (y === p[1] || y === p[1] + h - 1 || y === p[1] + Math.floor(h / 2) ? o.band ?? 'metalDark' : o.m ?? 'plank'));
  return g;
}

/** Table: top + 4 legs. p = min corner. opts: w, d, h, m, leg */
export function table(g, p, o = {}) {
  const w = o.w ?? 3, d = o.d ?? 2, h = o.h ?? 2;
  g.box([p[0], p[1] + h - 1, p[2]], [p[0] + w - 1, p[1] + h - 1, p[2] + d - 1], o.m ?? 'plank');
  for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) g.box([p[0] + x, p[1], p[2] + z], [p[0] + x, p[1] + h - 2, p[2] + z], o.leg ?? o.m ?? 'plankDark');
  return g;
}

/** Chair facing `side`. opts: m, seat (h=1 seat height) */
export function chair(g, p, side = '+z', o = {}) {
  const m = o.m ?? 'plankDark';
  g.put(p[0], p[1], p[2], m);
  const [dx, dz] = SIDES[side];
  g.box([p[0] - dx, p[1], p[2] - dz], [p[0] - dx, p[1] + 2, p[2] - dz], m);
  return g;
}

/** Bed along x. p = min corner. opts: w (length, 5), d (2), frame, sheet, pillow, blanket */
export function bed(g, p, o = {}) {
  const w = o.w ?? 5, d = o.d ?? 2;
  g.box(p, [p[0] + w - 1, p[1], p[2] + d - 1], o.frame ?? 'plankDark');
  g.box([p[0], p[1] + 1, p[2]], [p[0] + w - 1, p[1] + 1, p[2] + d - 1], o.sheet ?? 'paper');
  g.box([p[0] + 1, p[1] + 1, p[2]], [p[0] + w - 1, p[1] + 1, p[2] + d - 1], o.blanket ?? 'fabric');
  g.box([p[0], p[1] + 2, p[2]], [p[0], p[1] + 2, p[2] + d - 1], o.pillow ?? 'paper');
  g.box([p[0] - 1, p[1], p[2]], [p[0] - 1, p[1] + 3, p[2] + d - 1], o.frame ?? 'plankDark');
  return g;
}

/** Bookshelf against a wall (books on the +z face by default). p = min corner. opts: w, h, d (1), m, books ([ids]), side, seed */
export function bookshelf(g, p, o = {}) {
  const R = R_(o);
  const w = o.w ?? 4, h = o.h ?? 5, d = o.d ?? 1, m = o.m ?? 'plankDark';
  const books = o.books ?? ['fabricRed', 'fabric', 'paper', 'plankLight', 'moss'];
  const lo = p, hi = [p[0] + w - 1, p[1] + h - 1, p[2] + d - 1];
  g.box(lo, hi, m);
  for (let y = lo[1] + 1; y < hi[1]; y += 2) for (let x = lo[0] + 1; x < hi[0]; x++) {
    if (R() < 0.12) continue;
    g.set(x, y, hi[2], g.mat(R.pick(books)));
  }
  return g;
}

/** Fireplace into a wall: stone surround, fire inside, chimney up. p = min corner, side = facing. opts: w (5), h (4), stone, fire */
export function fireplace(g, p, side = '+z', o = {}) {
  const w = o.w ?? 5, h = o.h ?? 4;
  const [dx, dz] = SIDES[side];
  const alongX = dz !== 0;
  const W = alongX ? [w, 2] : [2, w];
  g.box(p, [p[0] + W[0] - 1, p[1] + h - 1, p[2] + W[1] - 1], o.stone ?? 'stoneBrick');
  // hearth opening on the facing side
  const fx = alongX ? p[0] + 1 : dx > 0 ? p[0] + 1 : p[0], fz = alongX ? (dz > 0 ? p[2] + 1 : p[2]) : p[2] + 1;
  for (let i = 0; i < w - 2; i++) for (let j = 0; j < Math.max(1, h - 2); j++) g.set(alongX ? fx + i : fx, p[1] + j, alongX ? fz : fz + i, j === 0 ? g.mat(o.fire ?? 'fire') : 0);
  return g;
}
