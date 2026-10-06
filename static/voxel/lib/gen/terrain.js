// Terrain generators: diorama base tiles, rolling terrain, floating islands, ponds, rivers, paths.
//
//   tile(g, [-20, -20], [20, 20], { depth: 6, top: 'grass', layers: [['dirt', 3], ['stone', 99]] });
//   terrain(g, [-30, -30], [30, 30], { height: 6, scale: 0.05, water: 'water', waterLevel: 2 });
//   island(g, [0, 20, 0], { radius: 18, depth: 22 });
//   pond(g, [6, 4], { radius: 5 });   river(g, [[-20, 0], [0, 5], [20, -3]], { width: 3 });
//   trail(g, [[-10, 8], [0, 2], [10, 6]], { width: 2, with: ['dirt', 'cobble'] });
import { rng, noise, hash3, clamp } from '../random.js';
import { spline } from '../shapes.js';

const list = (m) => (Array.isArray(m) ? m : [m]);

/** material for a depth below the surface given [[id, thickness], ...] layers */
function layerAt(layers, depth) {
  let acc = 0;
  for (const [m, t] of layers) { acc += t; if (depth < acc) return m; }
  return layers[layers.length - 1][0];
}

/**
 * Rectangular base slab — the classic iso diorama tile. Inclusive [x0, z0]..[x1, z1].
 * opts: y (top surface, 0), depth (6), top ('grass'), topDepth (1), layers ([['dirt', 3], ['dirtDark', 2], ['stone', 99]]),
 *       hills (fn(x, z) → extra height, or number amplitude for gentle noise), corner (rounded corner radius, 0),
 *       edge (0..1 noise eats into the side walls), lip (top material wraps this far down the sides, 0), seed
 */
export function tile(g, a, b, o = {}) {
  const N = noise(o.seed ?? 4);
  const y0 = o.y ?? 0, depth = o.depth ?? 6, top = o.top ?? 'grass', topDepth = o.topDepth ?? 1;
  const layers = o.layers ?? [['dirt', 3], ['dirtDark', 2], ['stone', 99]];
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
  const cr = o.corner ?? 0;
  const hills = typeof o.hills === 'function' ? o.hills : o.hills ? (x, z) => Math.max(0, N.fbm2(x * 0.06, z * 0.06, { octaves: 3 }) * o.hills) : () => 0;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if (cr > 0) {
      const cx = clamp(x, x0 + cr, x1 - cr), cz = clamp(z, z0 + cr, z1 - cr);
      if (Math.hypot(x - cx, z - cz) > cr + 0.25) continue;
    }
    const edgeDist = Math.min(x - x0, x1 - x, z - z0, z1 - z);
    const h = y0 + Math.round(hills(x, z));
    let bottom = y0 - depth + 1;
    if (o.edge && edgeDist < 2) bottom += Math.round(Math.max(0, N.simplex2(x * 0.3, z * 0.3)) * depth * o.edge);
    for (let y = bottom; y <= h; y++) {
      const d = h - y;
      const lip = o.lip && edgeDist === 0 && d < topDepth + o.lip;
      g.put(x, y, z, d < topDepth || lip ? top : layerAt(layers, d - topDepth), o.mode);
    }
  }
  return g;
}

/**
 * Noise heightmap terrain. opts: base (min y, 0), height (relief, 8), scale (0.04), octaves (4), ridged (false),
 * top ('grass'), layers, steep (id for slopes/cliffs, 'stone'), sand ('sand' near water), water, waterLevel, snow, snowLine, seed
 */
export function terrain(g, a, b, o = {}) {
  const N = noise(o.seed ?? 9);
  const base = o.base ?? 0, H = o.height ?? 8, sc = o.scale ?? 0.04;
  const layers = o.layers ?? [['dirt', 3], ['stone', 99]];
  const hf = (x, z) => base + 1 + (o.ridged ? N.ridged2(x * sc, z * sc, { octaves: o.octaves ?? 4 }) : (N.fbm2(x * sc, z * sc, { octaves: o.octaves ?? 4 }) + 1) / 2) * H;
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
  const wl = o.waterLevel ?? -Infinity;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const h = Math.floor(hf(x, z));
    const slope = Math.max(Math.abs(hf(x + 1, z) - hf(x - 1, z)), Math.abs(hf(x, z + 1) - hf(x, z - 1))) / 2;
    for (let y = base; y <= h; y++) {
      const d = h - y;
      let m;
      if (d === 0) m = o.snow && h >= (o.snowLine ?? base + H * 0.8) ? o.snow : h <= wl + 1 && o.sand !== false ? o.sand ?? 'sand' : slope > 1.2 && o.steep !== false ? o.steep ?? 'stone' : o.top ?? 'grass';
      else m = layerAt(layers, d - 1);
      g.put(x, y, z, m, o.mode);
    }
    if (o.water) for (let y = h + 1; y <= wl; y++) g.put(x, y, z, o.water, 'keep');
  }
  return g;
}

/**
 * Floating island: noisy round/square top + tapered, craggy underside.
 * opts: radius (16), depth (underside height, radius*1.2), relief (top hills, 2), shape 'round'|'square',
 *       top ('grass'), topDepth (1), layers (soil under the top), under (shades for the rocky underside), seed
 */
export function island(g, c, o = {}) {
  const N = noise(o.seed ?? 2);
  const R = o.radius ?? 16, D = o.depth ?? R * 1.2, relief = o.relief ?? 2;
  const top = o.top ?? 'grass', topDepth = o.topDepth ?? 1;
  const layers = o.layers ?? [['dirt', 2], ['dirtDark', 1]];
  const under = list(o.under ?? ['stoneDark', 'stone', 'dirtDark']);
  const square = o.shape === 'square';
  for (let x = Math.floor(c[0] - R - 2); x <= c[0] + R + 2; x++) for (let z = Math.floor(c[2] - R - 2); z <= c[2] + R + 2; z++) {
    const dx = x - c[0], dz = z - c[2];
    const rr = square ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.hypot(dx, dz);
    const edge = R * (1 + N.simplex2(x * 0.12, z * 0.12) * (square ? 0.04 : 0.12));
    if (rr > edge) continue;
    const k = rr / edge; // 0 center → 1 rim
    const h = c[1] + Math.round((N.fbm2(x * 0.08, z * 0.08, { octaves: 3 }) * 0.5 + 0.5) * relief * (1 - k * 0.5));
    // underside: deeper in the middle, craggy
    const taper = Math.pow(1 - k, square ? 0.35 : 0.8);
    const bot = c[1] - Math.round(D * taper * (0.75 + 0.25 * (N.simplex2(x * 0.25 + 40, z * 0.25) * 0.5 + 0.5)) + N.simplex2(x * 0.6, z * 0.6) * 1.5);
    for (let y = bot; y <= h; y++) {
      const d = h - y;
      let m;
      if (d < topDepth) m = top;
      else if (d < topDepth + layers.reduce((s, l) => s + l[1], 0)) m = layerAt(layers, d - topDepth);
      else {
        const t = clamp((N.simplex3(x * 0.15, y * 0.35, z * 0.15) + 1) / 2 + (hash3(x, y, z, 6) - 0.5) * 0.2);
        m = under[clamp(Math.floor(t * under.length), 0, under.length - 1)];
      }
      g.put(x, y, z, m, o.mode);
    }
  }
  return g;
}

/** Carve a basin into the surface and fill it with water. c = [x, z]. opts: radius, depth, water, shore ('sand' | false), bed ('sand'), level, seed */
export function pond(g, c, o = {}) {
  const N = noise(o.seed ?? 5);
  const R = o.radius ?? 5, depth = o.depth ?? 2;
  const surf = g.top(Math.round(c[0]), Math.round(c[1]));
  const level = o.level ?? surf;
  if (!Number.isFinite(level)) return g; // nothing to dig into at the center
  const cells = [];
  for (let x = Math.floor(c[0] - R - 2); x <= c[0] + R + 2; x++) for (let z = Math.floor(c[1] - R - 2); z <= c[1] + R + 2; z++) {
    const d = Math.hypot(x - c[0], z - c[1]) / (R * (1 + N.simplex2(x * 0.2, z * 0.2) * 0.25));
    cells.push([x, z, d]);
  }
  for (const [x, z, d] of cells) {
    const top = g.top(x, z, level + 4);
    if (!Number.isFinite(top)) continue; // empty column (pond overhangs the edge)
    if (d < 1) {
      const carve = Math.max(1, Math.round(depth * (1 - d * d)) + (top - level) + 1);
      for (let i = 0; i < carve; i++) g.set(x, top - i, z, 0);
      const floor = top - carve;
      if (o.bed !== false) g.set(x, floor, z, g.mat(o.bed ?? 'sand'));
      for (let y = floor + 1; y <= level; y++) g.set(x, y, z, g.mat(o.water ?? 'water'));
    } else if (d < 1.35 && o.shore !== false && top >= level - 1) {
      g.set(x, top, z, g.mat(o.shore ?? 'sand'));
    }
  }
  return g;
}

/** River/stream along 2D points [[x, z], ...]. opts: width, depth, water, bank, level */
export function river(g, pts, o = {}) {
  const path = spline(pts.map((p) => [p[0], 0, p[1]]), 8);
  const w = o.width ?? 3;
  for (let i = 0; i < path.length; i += 1) pond(g, [path[i][0], path[i][2]], { radius: w / 2, depth: o.depth ?? 2, water: o.water, shore: o.bank, level: o.level, bed: o.bed, seed: i });
  return g;
}

/** Paint a trail (dirt/cobble path) on top of the surface along 2D points. opts: width, with (id or shades), jitter */
export function trail(g, pts, o = {}) {
  const path = spline(pts.map((p) => [p[0], 0, p[1]]), 10);
  const shades = list(o.with ?? ['dirt']);
  const w = (o.width ?? 2) / 2;
  const done = new Set();
  for (const p of path) for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) for (let dz = -Math.ceil(w); dz <= Math.ceil(w); dz++) {
    if (Math.hypot(dx, dz) > w + (hash3(Math.round(p[0] + dx), 0, Math.round(p[2] + dz), 3) - 0.5) * (o.jitter ?? 0.8)) continue;
    const x = Math.round(p[0] + dx), z = Math.round(p[2] + dz), k = x + ',' + z;
    if (done.has(k)) continue;
    done.add(k);
    const y = g.top(x, z);
    if (y > -Infinity) g.set(x, y, z, g.mat(shades[Math.floor(hash3(x, y, z, 8) * shades.length)]));
  }
  return g;
}

/** Horizontal rock strata on exposed sides: recolor voxels by y bands. opts: on (ids), bands [[id, height], ...] (repeats), offset */
export function strata(g, o = {}) {
  const on = o.on ? new Set(list(o.on).map((m) => g.mat(m))) : null;
  const bands = o.bands ?? [['stone', 2], ['stoneDark', 1], ['stoneLight', 1]];
  const total = bands.reduce((s, b) => s + b[1], 0);
  const N = noise(o.seed ?? 3);
  return g.paint((x, y, z, id) => {
    if (on && !on.has(id)) return undefined;
    const yy = ((Math.floor(y + N.simplex2(x * 0.1, z * 0.1) * (o.wobble ?? 1.5) + (o.offset ?? 0)) % total) + total) % total;
    return layerAt(bands, yy);
  });
}
