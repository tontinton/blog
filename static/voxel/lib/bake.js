// Offline "global illumination" bakes, evaluated once at mesh time and stored per vertex:
//
//  - ray AO: for each air cell in front of a face, rays are cast into the face's hemisphere through
//    the voxel grid; nearby hits darken. Gives soft large-scale occlusion (under tables, inside rooms,
//    between buildings) that the classic 1-voxel vertex AO can't.
//  - emissive light: materials with `light` flood colored light through air (18-connected Dijkstra,
//    blocked by solid voxels) so lanterns, windows and neon actually light their surroundings.
//    Hundreds of light sources cost nothing at runtime.
//
// Both are optional (`bake: { ao: {...}, light: true }` on stage.add / buildMesh).

const fibDirs = (k) => {
  // cosine-weighted hemisphere directions around +Z (Fibonacci spiral → stable, no noise)
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < k; i++) {
    const u = (i + 0.5) / k;
    const r = Math.sqrt(u), th = i * ga;
    out.push([r * Math.cos(th), r * Math.sin(th), Math.sqrt(1 - u)]);
  }
  return out;
};

/** Dense occupancy (1 = solid opaque) over the grid bounds + margin. */
function occupancy(grid, cls, margin) {
  const b = grid.bounds();
  const min = [b.min[0] - margin, b.min[1] - margin, b.min[2] - margin];
  const size = [b.size[0] + 2 * margin, b.size[1] + 2 * margin, b.size[2] + 2 * margin];
  const occ = new Uint8Array(size[0] * size[1] * size[2]);
  const sx = 1, sz = size[0], sy = size[0] * size[2];
  grid.forEach((x, y, z, id) => {
    const c = cls[id];
    if (c) occ[(x - min[0]) * sx + (z - min[2]) * sz + (y - min[1]) * sy] = c;
  });
  return { occ, min, size, sx, sy, sz };
}

export class Baker {
  /**
   * opts.ao:    { radius = 6, rays = 20, strength handled in shader }  (true → defaults)
   * opts.light: true | { scale = 1 }   (only used if the palette has `light` materials)
   */
  constructor(grid, palette, cls, opts = {}) {
    this.grid = grid;
    this.cls = cls;
    const ao = opts.ao === true ? {} : opts.ao;
    this.aoOn = !!ao;
    this.radius = ao?.radius ?? 6;
    this.dirs = [];
    const margin = Math.ceil(this.radius) + 1;
    this.vol = occupancy(grid, cls, margin);
    if (this.aoOn) {
      const base = fibDirs(ao.rays ?? 20);
      // rotate the +Z hemisphere set to each of the 6 face normals (dir index: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z)
      for (let d = 0; d < 6; d++) {
        const a = d >> 1, s = d & 1 ? -1 : 1, u = (a + 1) % 3, v = (a + 2) % 3;
        this.dirs.push(base.map(([x, y, z]) => { const p = [0, 0, 0]; p[a] = z * s; p[u] = x; p[v] = y; return p; }));
      }
    }
    this.light = null;
    if (opts.light) this.light = bakeLight(grid, palette, cls, opts.light === true ? {} : opts.light);
  }

  /** occupancy at world cell (outside volume = empty) */
  solid(x, y, z) {
    const V = this.vol;
    const lx = x - V.min[0], ly = y - V.min[1], lz = z - V.min[2];
    if (lx < 0 || ly < 0 || lz < 0 || lx >= V.size[0] || ly >= V.size[1] || lz >= V.size[2]) return false;
    return V.occ[lx * V.sx + lz * V.sz + ly * V.sy] === 1;
  }

  /** Ray-traced openness (0 = buried, 1 = open sky) of air cell (x,y,z) looking along face dir d. */
  ao(x, y, z, d) {
    const dirs = this.dirs[d], R = this.radius, V = this.vol;
    const occ = V.occ, sx = V.sx, sy = V.sy, sz = V.sz, nx = V.size[0], ny = V.size[1], nz = V.size[2];
    let sum = 0;
    for (let i = 0; i < dirs.length; i++) {
      const dx = dirs[i][0], dy = dirs[i][1], dz = dirs[i][2];
      // Amanatides–Woo DDA from the cell center
      let cx = x - V.min[0], cy = y - V.min[1], cz = z - V.min[2];
      const stx = dx > 0 ? 1 : -1, sty = dy > 0 ? 1 : -1, stz = dz > 0 ? 1 : -1;
      const tdx = Math.abs(1 / (dx || 1e-9)), tdy = Math.abs(1 / (dy || 1e-9)), tdz = Math.abs(1 / (dz || 1e-9));
      let tmx = 0.5 * tdx, tmy = 0.5 * tdy, tmz = 0.5 * tdz;
      let t = 0, hit = R;
      while (t < R) {
        if (tmx < tmy && tmx < tmz) { cx += stx; t = tmx; tmx += tdx; }
        else if (tmy < tmz) { cy += sty; t = tmy; tmy += tdy; }
        else { cz += stz; t = tmz; tmz += tdz; }
        if (t >= R || cx < 0 || cy < 0 || cz < 0 || cx >= nx || cy >= ny || cz >= nz) break;
        if (occ[cx * sx + cz * sz + cy * sy] === 1) { hit = t; break; }
      }
      const k = hit / R;
      sum += k * (2 - k); // occlusion falls off smoothly with hit distance
    }
    return sum / dirs.length;
  }

  /** Baked light rgb at air cell, written into out[o..o+2]. */
  lightAt(x, y, z, out, o) {
    const L = this.light;
    if (!L) { out[o] = out[o + 1] = out[o + 2] = 0; return; }
    const lx = x - L.min[0], ly = y - L.min[1], lz = z - L.min[2];
    if (lx < 0 || ly < 0 || lz < 0 || lx >= L.size[0] || ly >= L.size[1] || lz >= L.size[2]) { out[o] = out[o + 1] = out[o + 2] = 0; return; }
    const i = (lx + lz * L.size[0] + ly * L.size[0] * L.size[2]) * 3;
    out[o] = L.rgb[i] / 4096; out[o + 1] = L.rgb[i + 1] / 4096; out[o + 2] = L.rgb[i + 2] / 4096;
  }
}

function bakeLight(grid, palette, cls, opts) {
  const scale = opts.scale ?? 1;
  // group sources by (color, intensity, radius)
  const groups = new Map();
  const lightOf = palette.defs.map((d) => d?.light ?? null);
  let maxR = 0;
  grid.forEach((x, y, z, id) => {
    const L = lightOf[id];
    if (!L) return;
    const k = `${L.key}|${L.intensity}|${L.radius}|${L.falloff}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { L, src: [] }));
    g.src.push(x, y, z);
    maxR = Math.max(maxR, L.radius);
  });
  if (!groups.size) return null;
  // field bounds = sources ± radius, clipped to grid bounds ± 1
  const b = grid.bounds();
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const g of groups.values()) {
    const R = Math.ceil(g.L.radius) + 1;
    for (let i = 0; i < g.src.length; i += 3) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], g.src[i + k] - R); max[k] = Math.max(max[k], g.src[i + k] + R);
    }
  }
  for (let k = 0; k < 3; k++) { min[k] = Math.max(min[k], b.min[k] - 1); max[k] = Math.min(max[k], b.max[k] + 1); }
  const size = [max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1];
  const N = size[0] * size[1] * size[2];
  if (N > (opts.maxCells ?? 40e6)) {
    console.warn(`voxel: light bake skipped, lit volume is ${(N / 1e6).toFixed(1)}M cells (> bake.light.maxCells). Split the scene into models or use fewer/clustered lights.`);
    return null;
  }
  const SX = 1, SZ = size[0], SY = size[0] * size[2];
  const open = new Uint8Array(N);
  for (let y = 0; y < size[1]; y++) for (let z = 0; z < size[2]; z++) for (let x = 0; x < size[0]; x++)
    open[x + z * SZ + y * SY] = cls[grid.get(x + min[0], y + min[1], z + min[2])] === 1 ? 0 : 1;
  const rgb = new Uint16Array(N * 3); // light * 4096 (max 16)
  const level = new Uint16Array(N);
  // 18-neighborhood: 6 faces (cost 16) + 12 edges (cost 23 ≈ 16√2), distances in 1/16 voxel
  const nb = [];
  for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const n = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    if (n === 0 || n === 3) continue;
    // for edge moves, a/b are the two face-adjacent cells the diagonal squeezes between
    const parts = [dx && dx * SX, dy && dy * SY, dz && dz * SZ].filter(Boolean);
    nb.push({ dx, dy, dz, off: dx * SX + dz * SZ + dy * SY, cost: n === 1 ? 16 : 23, a: parts[0], b: parts[1] ?? 0 });
  }
  for (const g of groups.values()) {
    level.fill(0);
    const R16 = Math.round(g.L.radius * 16);
    const buckets = Array.from({ length: R16 + 1 }, () => []);
    const seed = (i, v) => { if (v > level[i]) { level[i] = v; buckets[v].push(i); } };
    for (let s = 0; s < g.src.length; s += 3) {
      const x = g.src[s] - min[0], y = g.src[s + 1] - min[1], z = g.src[s + 2] - min[2];
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const X = x + dx, Y = y + dy, Z = z + dz;
        if (X < 0 || Y < 0 || Z < 0 || X >= size[0] || Y >= size[1] || Z >= size[2]) continue;
        const i = X + Z * SZ + Y * SY;
        if (open[i]) seed(i, R16 - 8);
      }
    }
    for (let v = R16; v > 0; v--) {
      const q = buckets[v];
      for (let qi = 0; qi < q.length; qi++) {
        const i = q[qi];
        if (level[i] !== v) continue;
        const x = i % SZ, z = Math.floor(i / SZ) % size[2], y = Math.floor(i / SY);
        for (let k = 0; k < nb.length; k++) {
          const n = nb[k], nv = v - n.cost;
          if (nv <= 0) continue;
          const X = x + n.dx, Y = y + n.dy, Z = z + n.dz;
          if (X < 0 || Y < 0 || Z < 0 || X >= size[0] || Y >= size[1] || Z >= size[2]) continue;
          const j = i + n.off;
          if (!open[j] || nv <= level[j]) continue;
          if (n.cost === 23 && !open[i + n.a] && !open[i + n.b]) continue; // no squeezing through closed diagonals
          level[j] = nv; buckets[nv].push(j);
        }
      }
      buckets[v] = null;
    }
    const c = g.L.color, I = g.L.intensity * scale, fo = g.L.falloff;
    for (let i = 0; i < N; i++) {
      const l = level[i];
      if (!l) continue;
      const f = l / R16, w = I * (fo === 'linear' ? f : fo === 'quadratic' ? f * f : f * f * (3 - 2 * f));
      rgb[i * 3] = Math.min(65535, rgb[i * 3] + c[0] * w * 4096);
      rgb[i * 3 + 1] = Math.min(65535, rgb[i * 3 + 1] + c[1] * w * 4096);
      rgb[i * 3 + 2] = Math.min(65535, rgb[i * 3 + 2] + c[2] * w * 4096);
    }
  }
  return { min, size, rgb, groups: groups.size };
}
