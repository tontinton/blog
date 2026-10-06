// Greedy voxel mesher → compact BufferGeometry for the voxel shader.
//
// Per vertex (16–20 bytes):
//   position  Int16×3  (grid coords)   aFace  Int16  (face dir 0..5 | convex-edge mask << 3)
//   aInfo     Uint8×4  (mat lo, mat hi, vertex AO 0..255, ray AO 0..255)
//   aEdge     Uint8×4  (distance in voxels to the quad's -u, +u, -v, +v edges → bevels)
//   aLight    Uint8×4  (baked emissive light rgb, ×4 range)   [only when lights are baked]
// Face dir: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z. Tangents: u = axis+1, v = axis+2 (mod 3).
//
// Faces merge only when every corner carries identical values, so AO/bakes stay exact.
import * as THREE from './three.js';
import { CHUNK, CHUNK_BITS } from './constants.js';
import { Baker } from './bake.js';

const N = CHUNK, P = N + 2, CM = CHUNK - 1;
const ST = [1, P * P, P]; // padded strides for axes x, y, z
const PAD0 = 1 + P + P * P; // padded index of local (0, 0, 0)
const CELLS = [[0, 0], [1, 0], [0, 1], [1, 1]];
const LIGHT_SCALE = 64; // stored = light * 64 → max 4.0

class QuadBuffer {
  constructor(light) {
    this.light = light;
    this.cap = 4096;
    this.n = 0;
    this.pos = new Int16Array(this.cap * 16);
    this.info = new Uint8Array(this.cap * 16);
    this.edge = new Uint8Array(this.cap * 16);
    this.lt = light ? new Uint8Array(this.cap * 16) : null;
    this.flip = new Uint8Array(this.cap);
  }
  grow() {
    this.cap *= 2;
    const g = (a, k) => { const b = new a.constructor(this.cap * k); b.set(a); return b; };
    this.pos = g(this.pos, 16); this.info = g(this.info, 16); this.edge = g(this.edge, 16); this.flip = g(this.flip, 1);
    if (this.lt) this.lt = g(this.lt, 16);
  }
  toGeometry() {
    if (!this.n) return null;
    const nv = this.n * 4;
    const geo = new THREE.BufferGeometry();
    const ib = new THREE.InterleavedBuffer(this.pos.slice(0, nv * 4), 4);
    geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    geo.setAttribute('aFace', new THREE.InterleavedBufferAttribute(ib, 1, 3));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(this.info.slice(0, nv * 4), 4));
    geo.setAttribute('aEdge', new THREE.BufferAttribute(this.edge.slice(0, nv * 4), 4));
    if (this.lt) geo.setAttribute('aLight', new THREE.BufferAttribute(this.lt.slice(0, nv * 4), 4, true));
    const idx = nv > 65535 ? new Uint32Array(this.n * 6) : new Uint16Array(this.n * 6);
    for (let q = 0; q < this.n; q++) {
      const v = q * 4, i = q * 6;
      if (this.flip[q]) { idx[i] = v + 1; idx[i + 1] = v + 2; idx[i + 2] = v + 3; idx[i + 3] = v + 1; idx[i + 4] = v + 3; idx[i + 5] = v; }
      else { idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2; idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3; }
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

// corner order per sign so triangles wind CCW seen from outside
const ORDER_POS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const ORDER_NEG = [[0, 0], [0, 1], [1, 1], [1, 0]];

/**
 * Mesh a grid. Returns { solid, transparent, stats } (geometries may be null).
 * opts: { ao: true (vertex AO), greedy: true, bake: { ao: {radius, rays} | true, light: true } }
 */
export function buildMesh(grid, palette, opts = {}) {
  const t0 = performance.now();
  const np = palette.size;
  const cls = new Uint8Array(np); // 0 empty, 1 solid, 2 water, 3 glass
  for (let i = 1; i < np; i++) cls[i] = palette.defs[i].kind + 1;
  const hasLights = palette.defs.some((d) => d?.light);
  const bakeOpts = opts.bake ?? {};
  const bakeAO = !!bakeOpts.ao, bakeLight = !!bakeOpts.light && hasLights;
  const baker = (bakeAO || bakeLight) && grid.bounds() ? new Baker(grid, palette, cls, { ao: bakeOpts.ao, light: bakeLight && bakeOpts.light }) : null;
  const useLight = !!baker?.light;
  const vao = opts.ao !== false, greedy = opts.greedy !== false;
  const tBake = performance.now() - t0;

  const out = [new QuadBuffer(useLight), new QuadBuffer(useLight)];
  const pad = new Uint16Array(P * P * P), pc = new Uint8Array(P * P * P);
  // per-slice face records
  const fId = new Uint16Array(N * N), fAO = new Uint8Array(N * N * 4), fRAO = new Uint8Array(N * N * 4), fMask = new Uint8Array(N * N);
  const fLt = new Uint8Array(N * N * 12), fUni = new Uint8Array(N * N), done = new Uint8Array(N * N);
  const fK1 = new Float64Array(N * N), fK2 = new Float64Array(N * N);
  // ray-AO cache per chunk: padded cell × dir → value+1 (0 = not computed)
  const raoCache = bakeAO ? new Float32Array(P * P * P * 6) : null;
  const tmpL = new Float32Array(3);
  const nbr = new Array(27), fw = [0, 0, 0], cw = [0, 0, 0];
  let faces = 0;

  for (const chunk of grid.chunks.values()) {
    const ox = chunk.cx * N, oy = chunk.cy * N, oz = chunk.cz * N;
    // padded copy with a 1-voxel border from the 26 neighbor chunks
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++)
      nbr[(dx + 1) + (dz + 1) * 3 + (dy + 1) * 9] = grid._chunk(chunk.cx + dx, chunk.cy + dy, chunk.cz + dz, false)?.data ?? null;
    let any = false;
    const cd = chunk.data;
    for (let i = 0; i < cd.length; i++) if (cd[i]) { any = true; break; }
    if (any) for (let y = -1; y <= N; y++) {
      const ny = y < 0 ? 0 : y >= N ? 18 : 9, ly = ((y + N) & CM) << (2 * CHUNK_BITS);
      for (let z = -1; z <= N; z++) {
        const nz = z < 0 ? 0 : z >= N ? 6 : 3, lz = ((z + N) & CM) << CHUNK_BITS;
        let pi = (z + 1) * P + (y + 1) * P * P;
        for (let x = -1; x <= N; x++, pi++) {
          const src = nbr[(x < 0 ? 0 : x >= N ? 2 : 1) + nz + ny];
          const v = src ? src[((x + N) & CM) | lz | ly] : 0;
          pad[pi] = v; pc[pi] = cls[v];
        }
      }
    }
    if (!any) continue;
    if (raoCache) raoCache.fill(0);
    const origin = [ox, oy, oz];

    for (let dir = 0; dir < 6; dir++) {
      const a = dir >> 1, s = dir & 1 ? -1 : 1, u = (a + 1) % 3, v = (a + 2) % 3;
      const sa = ST[a] * s, su = ST[u], sv = ST[v];
      const order = s > 0 ? ORDER_POS : ORDER_NEG;
      for (let i = 0; i < N; i++) {
        let sliceAny = false;
        const sliceBase = PAD0 + i * ST[a];
        for (let vv = 0; vv < N; vv++) for (let uu = 0; uu < N; uu++) {
          const k = uu + vv * N;
          fId[k] = 0;
          const pi = sliceBase + uu * su + vv * sv;
          const id = pad[pi];
          if (!id) continue;
          const c = pc[pi], fi = pi + sa, cn = pc[fi];
          const visible = c === 1 ? cn !== 1 : cn === 0 || (cn >= 2 && cn !== c);
          if (!visible) continue;
          sliceAny = true;
          fId[k] = id;
          // vertex AO from the 8 cells around the front cell
          const um = pc[fi - su] === 1 ? 1 : 0, up = pc[fi + su] === 1 ? 1 : 0, vm = pc[fi - sv] === 1 ? 1 : 0, vp = pc[fi + sv] === 1 ? 1 : 0;
          let a0 = 3, a1 = 3, a2 = 3, a3 = 3;
          if (vao) {
            a0 = um && vm ? 0 : 3 - (um + vm + (pc[fi - su - sv] === 1 ? 1 : 0));
            a1 = up && vm ? 0 : 3 - (up + vm + (pc[fi + su - sv] === 1 ? 1 : 0));
            a2 = up && vp ? 0 : 3 - (up + vp + (pc[fi + su + sv] === 1 ? 1 : 0));
            a3 = um && vp ? 0 : 3 - (um + vp + (pc[fi - su + sv] === 1 ? 1 : 0));
          }
          // corner AO indexed by (cu, cv): 00→a0, 10→a1, 11→a2, 01→a3
          fAO[k * 4] = a0; fAO[k * 4 + 1] = a1; fAO[k * 4 + 2] = a2; fAO[k * 4 + 3] = a3;
          // convex edges: the same voxel's side face toward ±u / ±v is also exposed
          const mask = c === 1 ? (pc[pi - su] !== 1 ? 1 : 0) | (pc[pi + su] !== 1 ? 2 : 0) | (pc[pi - sv] !== 1 ? 4 : 0) | (pc[pi + sv] !== 1 ? 8 : 0) : 0;
          fMask[k] = mask;
          let uni = a0 === a1 && a1 === a2 && a2 === a3;
          // bakes: average the (open) front-layer cells touching each corner
          if (baker) {
            fw[0] = origin[0]; fw[1] = origin[1]; fw[2] = origin[2]; fw[a] += i + s; fw[u] += uu; fw[v] += vv;
            for (let cnr = 0; cnr < 4; cnr++) {
              const cu = cnr === 1 || cnr === 2 ? 1 : -1, cv = cnr >= 2 ? 1 : -1;
              const sideU = cu > 0 ? up : um, sideV = cv > 0 ? vp : vm;
              let rs = 0, lr = 0, lg = 0, lb = 0, n = 0;
              for (let ci = 0; ci < 4; ci++) {
                const du = CELLS[ci][0] * cu, dv = CELLS[ci][1] * cv;
                if (du && dv && sideU && sideV) continue;
                const q = fi + du * su + dv * sv;
                if (pc[q] === 1) continue;
                cw[0] = fw[0]; cw[1] = fw[1]; cw[2] = fw[2]; cw[u] += du; cw[v] += dv;
                if (bakeAO) {
                  const ck = q * 6 + dir;
                  let val = raoCache[ck];
                  if (!val) raoCache[ck] = val = baker.ao(cw[0], cw[1], cw[2], dir) + 1;
                  rs += val - 1;
                }
                if (useLight) { baker.lightAt(cw[0], cw[1], cw[2], tmpL, 0); lr += tmpL[0]; lg += tmpL[1]; lb += tmpL[2]; }
                n++;
              }
              const inv = n ? 1 / n : 0;
              fRAO[k * 4 + cnr] = bakeAO ? Math.round((n ? rs * inv : 0) * 255) : 255;
              if (useLight) {
                fLt[k * 12 + cnr * 3] = Math.min(255, Math.round(lr * inv * LIGHT_SCALE));
                fLt[k * 12 + cnr * 3 + 1] = Math.min(255, Math.round(lg * inv * LIGHT_SCALE));
                fLt[k * 12 + cnr * 3 + 2] = Math.min(255, Math.round(lb * inv * LIGHT_SCALE));
              }
            }
            const r = fRAO, o = k * 4;
            uni = uni && r[o] === r[o + 1] && r[o] === r[o + 2] && r[o] === r[o + 3];
            if (useLight) {
              const L = fLt, b = k * 12;
              for (let j = 3; j < 12 && uni; j++) if (L[b + j] !== L[b + (j % 3)]) uni = false;
            }
          } else {
            fRAO[k * 4] = fRAO[k * 4 + 1] = fRAO[k * 4 + 2] = fRAO[k * 4 + 3] = 255;
          }
          fUni[k] = greedy && uni ? 1 : 0;
          fK1[k] = id + a0 * 65536 + mask * 262144 + fRAO[k * 4] * 4194304;
          fK2[k] = useLight ? fLt[k * 12] + fLt[k * 12 + 1] * 256 + fLt[k * 12 + 2] * 65536 : 0;
        }
        if (!sliceAny) continue;
        done.fill(0);
        for (let vv = 0; vv < N; vv++) for (let uu = 0; uu < N; uu++) {
          const k = uu + vv * N;
          if (!fId[k] || done[k]) continue;
          let w = 1, h = 1;
          if (fUni[k]) {
            const k1 = fK1[k], k2 = fK2[k];
            while (uu + w < N) { const j = k + w; if (!(fId[j] && fUni[j] && !done[j] && fK1[j] === k1 && fK2[j] === k2)) break; w++; }
            outer: while (vv + h < N) {
              for (let x = 0; x < w; x++) { const j = k + x + h * N; if (!(fId[j] && fUni[j] && !done[j] && fK1[j] === k1 && fK2[j] === k2)) break outer; }
              h++;
            }
          }
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) done[k + x + y * N] = 1;
          // emit
          const isT = pc[sliceBase + uu * su + vv * sv] >= 2;
          const qb = out[isT ? 1 : 0];
          if (qb.n === qb.cap) qb.grow();
          const q = qb.n++;
          const id = fId[k], mask = fMask[k];
          const A = origin[a] + i + (s > 0 ? 1 : 0);
          let b0 = 0, b2 = 0;
          for (let c4 = 0; c4 < 4; c4++) {
            const [cu, cv] = order[c4];
            const cornerIdx = cu ? (cv ? 2 : 1) : cv ? 3 : 0;
            // a merged quad's corner takes the record of the face at that corner (all equal when merged)
            const kc = k + (cu ? w - 1 : 0) + (cv ? (h - 1) * N : 0);
            const vi = (q * 4 + c4) * 4;
            const pos = [0, 0, 0]; pos[a] = A; pos[u] = origin[u] + uu + cu * w; pos[v] = origin[v] + vv + cv * h;
            qb.pos[vi] = pos[0]; qb.pos[vi + 1] = pos[1]; qb.pos[vi + 2] = pos[2]; qb.pos[vi + 3] = dir | (mask << 3);
            const ao = fAO[kc * 4 + cornerIdx], rao = fRAO[kc * 4 + cornerIdx];
            qb.info[vi] = id & 255; qb.info[vi + 1] = id >> 8; qb.info[vi + 2] = ao * 85; qb.info[vi + 3] = rao;
            qb.edge[vi] = cu * w; qb.edge[vi + 1] = (1 - cu) * w; qb.edge[vi + 2] = cv * h; qb.edge[vi + 3] = (1 - cv) * h;
            if (qb.lt) { const lo = kc * 12 + cornerIdx * 3; qb.lt[vi] = fLt[lo]; qb.lt[vi + 1] = fLt[lo + 1]; qb.lt[vi + 2] = fLt[lo + 2]; qb.lt[vi + 3] = 0; }
            const bright = ao * 85 + rao;
            if (c4 === 0 || c4 === 2) b0 += bright; else b2 += bright;
          }
          // split along the brighter diagonal to avoid AO anisotropy
          qb.flip[q] = b2 > b0 ? 1 : 0;
          faces++;
        }
      }
    }
  }
  const solid = out[0].toGeometry(), transparent = out[1].toGeometry();
  return {
    solid, transparent,
    stats: { quads: out[0].n + out[1].n, triangles: (out[0].n + out[1].n) * 2, ms: Math.round(performance.now() - t0), bakeMs: Math.round(tBake), lights: baker?.light?.groups ?? 0 },
  };
}
