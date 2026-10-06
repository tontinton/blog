// VoxelGrid: sparse, unbounded voxel storage (32³ chunks of Uint16 material ids, 0 = empty).
// Coordinates are integers, Y is up. Voxel (x, y, z) fills the unit cube [x, x+1]×[y, y+1]×[z, z+1].
//
//   const g = new VoxelGrid(P);          // P = Palette (lets you use names: g.set(0, 0, 0, 'stone'))
//   g.set(x, y, z, P.stone); g.get(x, y, z) → id; g.has(x, y, z); g.del(x, y, z)
//   g.box([0, 0, 0], [9, 0, 9], P.grass)  // all box ranges are INCLUSIVE
//   g.fill([x0, y0, z0], [x1, y1, z1], (x, y, z) => id | 0)
//   g.paint((x, y, z, id) => newId)      // recolor existing voxels
//   g.stamp(other, x, y, z, { rot: 1, mode: 'keep' })   g.symmetrize('x')  (mirror half a character)
//   g.forEach((x, y, z, id) => ...)  g.bounds()  g.count()  g.top(x, z)
//
// Shapes (sphere, cylinder, line, tube, roof, sdf, heightmap...) are added from shapes.js.
// Every writer takes an optional `mode`: 'replace' (default) | 'keep' (only into empty cells)
// | 'carve' (delete where the shape is) | 'paint' (only recolor voxels that already exist),
// and the material may be a function (x, y, z) → id for procedural coloring.
import { CHUNK, CHUNK_BITS } from './constants.js';

const M = CHUNK - 1;
const OFF = 1024; // chunk coords are biased so keys stay positive (±32k voxels per axis)
const key = (cx, cy, cz) => ((cx + OFF) * 2048 + (cy + OFF)) * 2048 + (cz + OFF);
export const chunkKey = key;

export class VoxelGrid {
  constructor(palette = null) {
    this.palette = palette;
    this.chunks = new Map(); // key → { cx, cy, cz, data: Uint16Array }
    this._lk = -1; this._lc = null;
  }

  /** Resolve a material reference (id, name, or falsy → 0). */
  mat(m) {
    if (typeof m === 'number') return m;
    if (!m) return 0;
    if (!this.palette) throw new Error('grid has no palette; pass ids, not names');
    return this.palette.id(m);
  }

  _chunk(cx, cy, cz, create) {
    const k = key(cx, cy, cz);
    if (k === this._lk) return this._lc;
    let c = this.chunks.get(k);
    if (!c) {
      if (!create) return null;
      c = { cx, cy, cz, data: new Uint16Array(CHUNK * CHUNK * CHUNK) };
      this.chunks.set(k, c);
    }
    this._lk = k; this._lc = c;
    return c;
  }

  /** Take ownership of a raw chunk { cx, cy, cz, data } (merging non-empty voxels if one exists). */
  adopt(c) {
    const k = key(c.cx, c.cy, c.cz);
    const ex = this.chunks.get(k);
    if (!ex) this.chunks.set(k, { cx: c.cx, cy: c.cy, cz: c.cz, data: c.data });
    else { const d = c.data, e = ex.data; for (let i = 0; i < d.length; i++) if (d[i]) e[i] = d[i]; }
    this._lk = -1; this._lc = null; this._b = undefined;
    return this;
  }

  get(x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const c = this._chunk(x >> CHUNK_BITS, y >> CHUNK_BITS, z >> CHUNK_BITS, false);
    return c ? c.data[(x & M) | ((z & M) << CHUNK_BITS) | ((y & M) << (2 * CHUNK_BITS))] : 0;
  }
  has(x, y, z) { return this.get(x, y, z) !== 0; }

  set(x, y, z, m) {
    m = typeof m === 'number' ? m : this.mat(m);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new Error(`VoxelGrid.set: non-finite coordinate (${x}, ${y}, ${z})`);
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const c = this._chunk(x >> CHUNK_BITS, y >> CHUNK_BITS, z >> CHUNK_BITS, m !== 0);
    if (c) { c.data[(x & M) | ((z & M) << CHUNK_BITS) | ((y & M) << (2 * CHUNK_BITS))] = m; this._b = undefined; }
    return this;
  }
  del(x, y, z) { return this.set(x, y, z, 0); }

  /** Write honoring a mode; `m` may be a function (x,y,z) → id. Internal workhorse for shapes. */
  put(x, y, z, m, mode = 'replace') {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    if (mode === 'carve') return this.set(x, y, z, 0);
    if (mode === 'keep' && this.get(x, y, z)) return this;
    if (mode === 'paint' && !this.get(x, y, z)) return this;
    const id = typeof m === 'function' ? this.mat(m(x, y, z)) : typeof m === 'number' ? m : this.mat(m);
    if (id || mode === 'replace') this.set(x, y, z, id);
    return this;
  }

  /** Inclusive box. opts: { mode, hollow: true (shell only), walls: true (shell without top/bottom) } */
  box(a, b, m, opts = {}) {
    const [x0, x1] = minmax(a[0], b[0]), [y0, y1] = minmax(a[1], b[1]), [z0, z1] = minmax(a[2], b[2]);
    const mode = opts.mode, hollow = opts.hollow, walls = opts.walls;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (hollow || walls) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1 || (hollow && (y === y0 || y === y1));
        if (!edge) continue;
      }
      this.put(x, y, z, m, mode);
    }
    return this;
  }

  /** Call fn(x,y,z) for every cell in an inclusive box; a truthy return is written. */
  fill(a, b, fn, opts = {}) {
    const [x0, x1] = minmax(a[0], b[0]), [y0, y1] = minmax(a[1], b[1]), [z0, z1] = minmax(a[2], b[2]);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const r = fn(x, y, z);
      if (r) this.put(x, y, z, r, opts.mode);
    }
    return this;
  }

  /** Visit every voxel: fn(x, y, z, id). Don't add voxels while iterating; use paint() to recolor. */
  forEach(fn) {
    for (const c of this.chunks.values()) {
      const d = c.data, ox = c.cx * CHUNK, oy = c.cy * CHUNK, oz = c.cz * CHUNK;
      for (let i = 0; i < d.length; i++) {
        const v = d[i];
        if (v) fn(ox + (i & M), oy + (i >> (2 * CHUNK_BITS)), oz + ((i >> CHUNK_BITS) & M), v);
      }
    }
  }

  /** Visit voxels inside an inclusive box (fast: only touches overlapping chunks). */
  forEachIn(a, b, fn) {
    const C = CHUNK;
    for (const c of this.chunks.values()) {
      const ox = c.cx * C, oy = c.cy * C, oz = c.cz * C;
      if (ox > b[0] || oy > b[1] || oz > b[2] || ox + C - 1 < a[0] || oy + C - 1 < a[1] || oz + C - 1 < a[2]) continue;
      const x0 = Math.max(0, a[0] - ox), x1 = Math.min(C - 1, b[0] - ox), y0 = Math.max(0, a[1] - oy), y1 = Math.min(C - 1, b[1] - oy), z0 = Math.max(0, a[2] - oz), z1 = Math.min(C - 1, b[2] - oz);
      const d = c.data;
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const row = (z << CHUNK_BITS) | (y << (2 * CHUNK_BITS));
        for (let x = x0; x <= x1; x++) { const v = d[row | x]; if (v) fn(ox + x, oy + y, oz + z, v); }
      }
    }
  }

  /** Recolor in place: fn(x, y, z, id) → new id (0 deletes, undefined keeps). Optional inclusive bounds. */
  paint(fn, a, b) {
    const edits = [];
    this.forEach((x, y, z, id) => {
      if (a && (x < a[0] || y < a[1] || z < a[2] || x > b[0] || y > b[1] || z > b[2])) return;
      const r = fn(x, y, z, id);
      if (r !== undefined && r !== id) edits.push(x, y, z, this.mat(r));
    });
    for (let i = 0; i < edits.length; i += 4) this.set(edits[i], edits[i + 1], edits[i + 2], edits[i + 3]);
    return this;
  }

  /** Replace every `from` with `to` (ids or names). */
  replace(from, to, a, b) {
    const f = this.mat(from), t = this.mat(to);
    return this.paint((x, y, z, id) => (id === f ? t : undefined), a, b);
  }

  /** Visit voxels whose neighbor in `dir` ([0,1,0] = up) is empty: surfaces for scattering grass, moss, snow. */
  surface(fn, dir = [0, 1, 0]) {
    const out = [];
    this.forEach((x, y, z, id) => { if (!this.get(x + dir[0], y + dir[1], z + dir[2])) out.push(x, y, z, id); });
    for (let i = 0; i < out.length; i += 4) fn(out[i], out[i + 1], out[i + 2], out[i + 3]);
    return this;
  }

  /** Highest solid y in column (x, z) at or below `fromY`, or -Infinity. */
  top(x, z, fromY) {
    const b = this.bounds();
    if (!b) return -Infinity;
    for (let y = Math.min(fromY ?? b.max[1], b.max[1]); y >= b.min[1]; y--) if (this.get(x, y, z)) return y;
    return -Infinity;
  }

  /** Exact bounds of solid voxels: { min: [x,y,z], max: [x,y,z] } (inclusive) or null if empty. */
  bounds() {
    if (this._b !== undefined) return this._b;
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], any = false;
    this.forEach((x, y, z) => {
      any = true;
      if (x < mn[0]) mn[0] = x; if (y < mn[1]) mn[1] = y; if (z < mn[2]) mn[2] = z;
      if (x > mx[0]) mx[0] = x; if (y > mx[1]) mx[1] = y; if (z > mx[2]) mx[2] = z;
    });
    return (this._b = any ? { min: mn, max: mx, size: [mx[0] - mn[0] + 1, mx[1] - mn[1] + 1, mx[2] - mn[2] + 1] } : null);
  }

  count() { let n = 0; this.forEach(() => n++); return n; }

  clear() { this.chunks.clear(); this._lk = -1; this._lc = null; this._b = undefined; return this; }

  clone() {
    const g = new VoxelGrid(this.palette);
    for (const [k, c] of this.chunks) g.chunks.set(k, { cx: c.cx, cy: c.cy, cz: c.cz, data: c.data.slice() });
    return g;
  }

  /**
   * Copy another grid into this one at offset (x, y, z).
   * opts: rot (quarter turns around Y, 0..3), flipX, flipZ, mode ('replace'|'keep'|'carve'|'paint'),
   *       remap (Map | fn(id) → id), center (true: offset is where the source's bottom-center lands).
   * Different palettes are merged automatically (by material name).
   */
  stamp(src, x = 0, y = 0, z = 0, opts = {}) {
    if (src === this) src = src.clone(); // reading while writing would never end
    const rot = ((opts.rot ?? 0) % 4 + 4) % 4, mode = opts.mode ?? 'replace';
    let remap = opts.remap;
    if (!remap && src.palette && this.palette && src.palette !== this.palette) {
      const m = this.palette.merge(src.palette);
      remap = (id) => m.get(id) ?? id;
    } else if (remap instanceof Map) { const m = remap; remap = (id) => m.get(id) ?? id; }
    const b = src.bounds();
    if (!b) return this;
    // pivot = source bottom-center (if center) or source origin
    const px = opts.center ? Math.floor((b.min[0] + b.max[0]) / 2) : 0, pz = opts.center ? Math.floor((b.min[2] + b.max[2]) / 2) : 0, py = opts.center ? b.min[1] : 0;
    src.forEach((sx, sy, sz, id) => {
      let lx = sx - px, lz = sz - pz;
      if (opts.flipX) lx = -lx;
      if (opts.flipZ) lz = -lz;
      for (let r = 0; r < rot; r++) [lx, lz] = [-lz, lx];
      const out = remap ? remap(id) : id;
      this.put(x + lx, y + sy - py, z + lz, out, mode);
    });
    return this;
  }

  /** New grid with every voxel scaled up to a k×k×k block (sketch low-res, then refine). */
  scaled(k) {
    const g = new VoxelGrid(this.palette);
    this.forEach((x, y, z, id) => g.box([x * k, y * k, z * k], [x * k + k - 1, y * k + k - 1, z * k + k - 1], id));
    return g;
  }

  /**
   * Mirror one half onto the other: model half a character, then g.symmetrize('x').
   * axis 'x' | 'z'; c = mirror center (a voxel coordinate: odd-width models centered on voxel c;
   * pass c = 0.5-offset like -0.5 to mirror between voxels for even widths); keep 'neg' | 'pos' = source side.
   */
  symmetrize(axis = 'x', c = 0, keep = 'neg') {
    const ai = axis === 'x' ? 0 : 2, out = [];
    this.forEach((x, y, z, id) => {
      const p = [x, y, z], v = p[ai];
      if (keep === 'neg' ? v > c : v < c) return;
      p[ai] = Math.round(2 * c - v);
      out.push(p[0], p[1], p[2], id);
    });
    for (let i = 0; i < out.length; i += 4) this.set(out[i], out[i + 1], out[i + 2], out[i + 3]);
    return this;
  }

  /** New grid rotated by quarter turns around Y (about the origin). */
  rotated(rot = 1) { return new VoxelGrid(this.palette).stamp(this, 0, 0, 0, { rot }); }
  /** New grid mirrored along an axis ('x' | 'z'). */
  mirrored(axis = 'x') { return new VoxelGrid(this.palette).stamp(this, 0, 0, 0, axis === 'x' ? { flipX: true } : { flipZ: true }); }

  /** Shift every voxel so the bottom-center of the bounds sits at the origin (or at `to`). */
  recenter(to = [0, 0, 0]) {
    const b = this.bounds();
    if (!b) return this;
    // same bottom-center voxel as stamp({ center: true })
    const dx = to[0] - Math.floor((b.min[0] + b.max[0]) / 2), dy = to[1] - b.min[1], dz = to[2] - Math.floor((b.min[2] + b.max[2]) / 2);
    const g = new VoxelGrid(this.palette).stamp(this, dx, dy, dz);
    this.chunks = g.chunks; this._lk = -1; this._lc = null; this._b = undefined;
    return this;
  }
}

function minmax(a, b) { a = Math.floor(a); b = Math.floor(b); return a <= b ? [a, b] : [b, a]; }
