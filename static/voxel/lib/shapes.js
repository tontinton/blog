// Shape brushes, installed as VoxelGrid methods. Conventions:
//  - points are voxel coords; a shape centered on [10, 4, 10] is centered on that voxel's center.
//    Use .5 offsets to center between voxels (even-sized shapes): [9.5, 4, 9.5].
//  - `m` is an id, a name, or (x, y, z) → id. `opts.mode` is 'replace' | 'keep' | 'carve' | 'paint'.
//  - all ranges are inclusive.
//
//   g.sphere([8, 8, 8], 5, P.leaf)                         g.ellipsoid(c, [6, 3, 4], m)
//   g.cylinder([8, 0, 8], 3, 10, P.bark, { r2: 2 })        g.cone(c, 4, 9, m)   g.disc(c, 5, m)
//   g.line([0, 0, 0], [5, 9, 3], m, { r: 1.2, r2: 0.6 })   g.tube([[...], [...], ...], m, { r: 2, r2: 0.5 })
//   g.torus(c, 6, 1.5, m)   g.pyramid(c, 6, m)             g.roof([0, 10, 0], [12, 10, 8], m, { type: 'gable' })
//   g.sdf((x, y, z) => dist, [x0, y0, z0], [x1, y1, z1], m) g.heightmap([x0, z0], [x1, z1], (x, z) => h, (x, y, z, depth) => id)
//   g.layers([x, y, z], [`top-down slice y0`, `slice y1`, ...], { '#': P.wood, 'o': P.lamp })
//   g.ascii([x, y, z], `picture`, legend, { plane: 'xy' })  g.text('OPEN', [x, y, z], m, { plane: 'xy' })
import { VoxelGrid } from './grid.js';

const AX = { x: 0, y: 1, z: 2 };
const P = VoxelGrid.prototype;

function axisFrame(axis = 'y') {
  const a = AX[axis] ?? axis;
  return [a, (a + 1) % 3, (a + 2) % 3];
}
const at = (a, u, v, ia, iu, iv) => { const p = [0, 0, 0]; p[ia] = a; p[iu] = u; p[iv] = v; return p; };

P.sphere = function (c, r, m, opts = {}) {
  return this.ellipsoid(c, [r, r, r], m, opts);
};

/** opts.hollow = shell thickness in voxels */
P.ellipsoid = function (c, rad, m, opts = {}) {
  const [rx, ry, rz] = rad, sh = opts.hollow;
  const cx = c[0] + 0.5, cy = c[1] + 0.5, cz = c[2] + 0.5;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d > 1.0001) continue;
        if (sh) {
          const ix = (x + 0.5 - cx) / Math.max(rx - sh, 1e-3), iy = (y + 0.5 - cy) / Math.max(ry - sh, 1e-3), iz = (z + 0.5 - cz) / Math.max(rz - sh, 1e-3);
          if (ix * ix + iy * iy + iz * iz < 1) continue;
        }
        this.put(x, y, z, m, opts.mode);
      }
  return this;
};

/** Base center c, height h along +axis. opts: { axis: 'y', r2 (top radius), hollow (wall thickness) } */
P.cylinder = function (c, r, h, m, opts = {}) {
  const [ia, iu, iv] = axisFrame(opts.axis);
  const r2 = opts.r2 ?? r, sh = opts.hollow;
  const cu = c[iu] + 0.5, cv = c[iv] + 0.5;
  const n = Math.max(1, Math.round(h));
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const rr = r + (r2 - r) * t;
    if (rr <= 0) continue;
    for (let u = Math.floor(cu - rr); u <= Math.ceil(cu + rr); u++)
      for (let v = Math.floor(cv - rr); v <= Math.ceil(cv + rr); v++) {
        const d = Math.hypot(u + 0.5 - cu, v + 0.5 - cv);
        if (d > rr + 1e-4 || (sh && d < rr - sh)) continue;
        const p = at(c[ia] + i, u, v, ia, iu, iv);
        this.put(p[0], p[1], p[2], m, opts.mode);
      }
  }
  return this;
};
P.cone = function (c, r, h, m, opts = {}) { return this.cylinder(c, r, h, m, { ...opts, r2: opts.r2 ?? 0.35 }); };
P.disc = function (c, r, m, opts = {}) { return this.cylinder(c, r, 1, m, opts); };

/** Straight line; opts.r > 0 makes it a (tapered with r2) capsule. */
P.line = function (a, b, m, opts = {}) {
  const r = opts.r ?? 0, r2 = opts.r2 ?? r;
  if (r <= 0.5 && r2 <= 0.5) {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]), 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.put(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), m, opts.mode);
    }
    return this;
  }
  const R = Math.max(r, r2);
  const lo = [0, 1, 2].map((i) => Math.floor(Math.min(a[i], b[i]) - R)), hi = [0, 1, 2].map((i) => Math.ceil(Math.max(a[i], b[i]) + R));
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
  for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const t = Math.min(1, Math.max(0, (px * d[0] + py * d[1] + pz * d[2]) / len2));
    const qx = px - d[0] * t, qy = py - d[1] * t, qz = pz - d[2] * t;
    const rr = r + (r2 - r) * t;
    if (qx * qx + qy * qy + qz * qz <= rr * rr + 1e-4) this.put(x, y, z, m, opts.mode);
  }
  return this;
};

/** Smooth tube through points (Catmull-Rom). opts: { r, r2 (end radius), steps per segment } — branches, roots, vines, rivers. */
P.tube = function (pts, m, opts = {}) {
  const r = opts.r ?? 1, r2 = opts.r2 ?? r;
  const path = spline(pts, opts.steps ?? 6);
  for (let i = 0; i < path.length - 1; i++) {
    const t0 = i / (path.length - 1), t1 = (i + 1) / (path.length - 1);
    this.line(path[i], path[i + 1], m, { r: r + (r2 - r) * t0, r2: r + (r2 - r) * t1, mode: opts.mode });
  }
  return this;
};

/** Catmull-Rom sample of a polyline → array of points. */
export function spline(pts, steps = 6) {
  if (pts.length < 3) return pts.map((p) => p.slice());
  const out = [];
  const g = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

/** Torus around `axis` with ring radius R and tube radius r. */
P.torus = function (c, R, r, m, opts = {}) {
  const [ia, iu, iv] = axisFrame(opts.axis);
  const cc = [c[0] + 0.5, c[1] + 0.5, c[2] + 0.5];
  const e = R + r;
  for (let a = Math.floor(cc[ia] - r); a <= Math.ceil(cc[ia] + r); a++)
    for (let u = Math.floor(cc[iu] - e); u <= Math.ceil(cc[iu] + e); u++)
      for (let v = Math.floor(cc[iv] - e); v <= Math.ceil(cc[iv] + e); v++) {
        const q = Math.hypot(u + 0.5 - cc[iu], v + 0.5 - cc[iv]) - R;
        if (q * q + (a + 0.5 - cc[ia]) ** 2 <= r * r + 1e-4) { const p = at(a, u, v, ia, iu, iv); this.put(p[0], p[1], p[2], m, opts.mode); }
      }
  return this;
};

/** Stepped pyramid: base half-size `s` centered on c (bottom layer at c[1]); opts.step = rise per ring (1), opts.hollow */
P.pyramid = function (c, s, m, opts = {}) {
  const step = opts.step ?? 1;
  for (let k = 0; s - k >= 0; k++)
    for (let dy = 0; dy < step; dy++) this.box([c[0] - s + k, c[1] + k * step + dy, c[2] - s + k], [c[0] + s - k, c[1] + k * step + dy, c[2] + s - k], m, { mode: opts.mode, walls: opts.hollow && s - k > 0 });
  return this;
};

/**
 * Roof over the inclusive footprint a..b (a = [x0, y, z0], b = [x1, _, z1]); y is the eave height.
 * opts: type 'gable' | 'hip' | 'shed' | 'flat' (gable), axis 'x' | 'z' ridge direction (longest side),
 *       overhang (1), slope (rise per step, 1), thickness (slope + 1 = closed steps; Infinity = solid), gable: id to fill the
 *       triangular gable ends (walls), ridge: id for the ridge row.
 */
P.roof = function (a, b, m, opts = {}) {
  const type = opts.type ?? 'gable', oh = opts.overhang ?? 1, slope = opts.slope ?? 1;
  const th = opts.thickness === Infinity ? Infinity : Math.max(1, Math.ceil(opts.thickness ?? slope + 1));
  const x0 = Math.min(a[0], b[0]) - oh, x1 = Math.max(a[0], b[0]) + oh, z0 = Math.min(a[2], b[2]) - oh, z1 = Math.max(a[2], b[2]) + oh;
  const y0 = a[1];
  const axis = opts.axis ?? (x1 - x0 >= z1 - z0 ? 'x' : 'z');
  // height of the roof surface at (x, z): distance-to-edge in the sloped direction(s)
  const H = (x, z) => {
    const dz = Math.min(z - z0, z1 - z), dx = Math.min(x - x0, x1 - x);
    if (type === 'flat') return 0;
    if (type === 'shed') return (axis === 'x' ? z - z0 : x - x0) * slope;
    if (type === 'hip') return Math.min(dx, dz) * slope;
    return (axis === 'x' ? dz : dx) * slope;
  };
  let ridgeH = 0;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) ridgeH = Math.max(ridgeH, Math.floor(H(x, z)));
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const h = Math.floor(H(x, z));
    const top = y0 + h;
    const lowest = Math.max(y0, top - th + 1);
    for (let y = lowest; y <= top; y++) {
      const isRidge = h === ridgeH && type !== 'flat' && type !== 'shed';
      this.put(x, y, z, isRidge && opts.ridge ? opts.ridge : m, opts.mode);
    }
  }
  if (opts.gable && type === 'gable') {
    const ins = (v, lo, hi) => v >= lo && v <= hi;
    const [ax0, ax1, az0, az1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[2], b[2]), Math.max(a[2], b[2])];
    for (let x = ax0; x <= ax1; x++) for (let z = az0; z <= az1; z++) {
      const end = axis === 'x' ? x === ax0 || x === ax1 : z === az0 || z === az1;
      if (!end) continue;
      const h = Math.floor(H(x, z));
      for (let y = y0; y < y0 + h - th + 1; y++) if (ins(x, ax0, ax1)) this.put(x, y, z, opts.gable, 'keep');
    }
  }
  return this;
};

/** Fill where fn(x, y, z) <= 0, sampled at voxel centers over inclusive bounds. m may be (x, y, z, d) → id. */
P.sdf = function (fn, a, b, m, opts = {}) {
  for (let y = Math.floor(a[1]); y <= b[1]; y++) for (let z = Math.floor(a[2]); z <= b[2]; z++) for (let x = Math.floor(a[0]); x <= b[0]; x++) {
    const d = fn(x + 0.5, y + 0.5, z + 0.5);
    if (d > 0) continue;
    this.put(x, y, z, typeof m === 'function' ? m(x, y, z, d) : m, opts.mode);
  }
  return this;
};

/**
 * Terrain columns over the inclusive (x, z) rect. hfn(x, z) → top y (column skipped if < base).
 * mfn(x, y, z, depth) → id, depth = 0 at the top voxel. opts.base = lowest y (0).
 */
P.heightmap = function (a, b, hfn, mfn, opts = {}) {
  const base = opts.base ?? 0;
  for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) for (let z = Math.min(a[1], b[1]); z <= Math.max(a[1], b[1]); z++) {
    const h = Math.floor(hfn(x, z));
    for (let y = base; y <= h; y++) this.put(x, y, z, typeof mfn === 'function' ? mfn(x, y, z, h - y) : mfn, opts.mode);
  }
  return this;
};

/**
 * Build a small model from text slices. `layers[0]` is the bottom (y = origin y). Each slice is a
 * top-down picture: columns → +x, rows → +z. Whitespace lines at the start/end are trimmed, and
 * the common indentation is removed. Unknown chars and ' ' / '.' are empty.
 *   g.layers([4, 0, 4], [`
 *     ###
 *     #.#
 *     ###`, `
 *     .o.`], { '#': P.wood, o: P.lamp })
 */
P.layers = function (origin, layers, legend, opts = {}) {
  layers.forEach((layer, ly) => {
    textRows(layer).forEach((row, rz) => {
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        const m = legend[ch];
        if (m === undefined || m === null) continue;
        this.put(origin[0] + rx, origin[1] + ly, origin[2] + rz, m, opts.mode);
      }
    });
  });
  return this;
};

/**
 * Stamp a 2D picture. plane 'xy' (default; rows go down in -y, cols +x — a sign facing +z),
 * 'zy' (facing +x), 'xz' (lying flat, rows +z). The top-left char lands at `origin`.
 * opts.flip mirrors columns (use for signs facing -z / -x).
 */
P.ascii = function (origin, pic, legend, opts = {}) {
  const plane = opts.plane ?? 'xy';
  const rows = textRows(pic);
  const width = Math.max(...rows.map((r) => r.length));
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const m = legend[row[c]];
      if (m === undefined || m === null) continue;
      const cc = opts.flip ? width - 1 - c : c;
      const p = plane === 'xy' ? [origin[0] + cc, origin[1] - r, origin[2]] : plane === 'zy' ? [origin[0], origin[1] - r, origin[2] + cc] : [origin[0] + cc, origin[1], origin[2] + r];
      this.put(p[0], p[1], p[2], m, opts.mode);
    }
  });
  return this;
};

function textRows(s) {
  let rows = s.replace(/\t/g, '  ').split('\n');
  while (rows.length && !rows[0].trim()) rows.shift();
  while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
  const indent = Math.min(...rows.filter((r) => r.trim()).map((r) => r.match(/^ */)[0].length));
  return rows.map((r) => r.slice(indent));
}

// 3×5 pixel font (uppercase, digits, a little punctuation)
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', ' ': '000000000000000', '.': '000000000000010', '!': '010010010000010', '-': '000000111000000',
  ':': '000010000010000', "'": '010010000000000', '?': '110001010000010', '+': '000010111010000', '/': '001001010100100',
};

/** Pixel text (3×5 glyphs, 1 voxel spacing). Same planes as ascii(). opts.scale = voxels per pixel. */
P.text = function (str, origin, m, opts = {}) {
  const k = opts.scale ?? 1;
  let col = 0;
  for (const ch of String(str).toUpperCase()) {
    const g = FONT[ch] ?? FONT['?'];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (g[r * 3 + c] !== '1') continue;
      for (let sy = 0; sy < k; sy++) for (let sx = 0; sx < k; sx++) {
        const u = (col + c) * k + sx, v = r * k + sy;
        const plane = opts.plane ?? 'xy';
        const uu = opts.flip ? -u : u;
        const p = plane === 'xy' ? [origin[0] + uu, origin[1] - v, origin[2]] : plane === 'zy' ? [origin[0], origin[1] - v, origin[2] + uu] : [origin[0] + uu, origin[1], origin[2] + v];
        this.put(p[0], p[1], p[2], m, opts.mode);
      }
    }
    col += 4;
  }
  return this;
};
