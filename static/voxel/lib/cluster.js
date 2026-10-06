// Spatial clusters: a big grid is meshed as columns of size×size chunks (default 4 → 128×128 voxels,
// full height), each its own mesh with a bounding sphere, so three.js frustum-culls what's off screen and
// clusters can be meshed in parallel (workers) and rebuilt independently.
import { CHUNK } from './constants.js';

/** Group grid chunks into clusters → [{ key, chunks, min, max }] (min/max inclusive voxel bounds). */
export function clusterChunks(grid, size = 4) {
  const map = new Map();
  for (const c of grid.chunks.values()) {
    if (!c.data.some((v) => v)) continue;
    const kx = Math.floor(c.cx / size), kz = Math.floor(c.cz / size);
    const key = `${kx},${kz}`;
    let cl = map.get(key);
    if (!cl) map.set(key, (cl = { key, kx, kz, chunks: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
    cl.chunks.push(c);
    const lo = [c.cx * CHUNK, c.cy * CHUNK, c.cz * CHUNK];
    for (let k = 0; k < 3; k++) { cl.min[k] = Math.min(cl.min[k], lo[k]); cl.max[k] = Math.max(cl.max[k], lo[k] + CHUNK - 1); }
  }
  return [...map.values()];
}

/** Chunks a cluster's meshing needs: its own + a ring of `apron` chunks (face culling, AO, light reach). */
export function clusterInputs(grid, cl, apron = 1) {
  const own = new Set(cl.chunks);
  const out = [...cl.chunks];
  const cx0 = Math.floor(cl.min[0] / CHUNK) - apron, cx1 = Math.floor(cl.max[0] / CHUNK) + apron;
  const cy0 = Math.floor(cl.min[1] / CHUNK) - apron, cy1 = Math.floor(cl.max[1] / CHUNK) + apron;
  const cz0 = Math.floor(cl.min[2] / CHUNK) - apron, cz1 = Math.floor(cl.max[2] / CHUNK) + apron;
  for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) for (let cz = cz0; cz <= cz1; cz++) {
    const c = grid._chunk(cx, cy, cz, false);
    if (c && !own.has(c)) out.push(c);
  }
  return out;
}
