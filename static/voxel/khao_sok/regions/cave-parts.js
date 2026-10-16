// Helpers for the cave region (regions/cave.js): polyline geometry, the cave creek, the boardwalk trail, the
// cave shrine and the bat sign. Everything is deterministic and writes only through g.
import { hash3, clamp } from '../../lib/index.js';

/** Densify a polyline [[x, z], …] into samples { x, z, s (arc length), dx, dz (unit direction) } every `step`. */
export function sampleLine(pts, step = 0.5) {
  const out = [];
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let t = 0; t < len; t += step) out.push({ x: ax + dx * t, z: az + dz * t, s: s + t, dx, dz });
    s += len;
  }
  const [lx, lz] = pts[pts.length - 1], last = out[out.length - 1];
  out.push({ x: lx, z: lz, s, dx: last.dx, dz: last.dz });
  return out;
}

/** Nearest sample index + distance for every cell in a bbox around the samples (radius r): Map key 'x,z' → { i, d }. */
export function nearField(S, r) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of S) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  x0 = Math.floor(x0 - r - 1); x1 = Math.ceil(x1 + r + 1); z0 = Math.floor(z0 - r - 1); z1 = Math.ceil(z1 + r + 1);
  const W = x1 - x0 + 1, D = z1 - z0 + 1, best = new Float32Array(W * D).fill(1e9), idx = new Int32Array(W * D).fill(-1);
  const R = Math.ceil(r + 1);
  S.forEach((p, i) => {
    for (let z = Math.floor(p.z - R); z <= Math.ceil(p.z + R); z++) for (let x = Math.floor(p.x - R); x <= Math.ceil(p.x + R); x++) {
      const d = Math.hypot(x - p.x, z - p.z), j = (x - x0) + (z - z0) * W;
      if (d < best[j]) { best[j] = d; idx[j] = i; }
    }
  });
  const cells = [];
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const j = (x - x0) + (z - z0) * W; if (best[j] <= r) cells.push({ x, z, i: idx[j], d: best[j] }); }
  return cells;
}

/** Rectangles (for rainforest/undergrowth `avoid`) covering a polyline with a margin. */
export function lineRects(pts, half, every = 3) {
  const S = sampleLine(pts, every), out = [];
  for (const p of S) out.push([[Math.floor(p.x - half), Math.floor(p.z - half)], [Math.ceil(p.x + half), Math.ceil(p.z + half)]]);
  return out;
}

/**
 * Carve a creek into the land surface along pts (from its source to the lake), stepping down with the terrain
 * (little cascades with foam). topAt(x, z) → current land top. width(t) half width (t 0..1 along).
 * Writes water at the creek surface, a pebble bed under it, muddy banks. Returns the samples with their water y.
 */
export function creek(g, pts, o) {
  const S = sampleLine(pts, 0.5), L = S[S.length - 1].s;
  const water = g.mat(o.water), bed = g.mat(o.bed), bank = g.mat(o.bank), foam = g.mat(o.foam), rockM = (o.rocks ?? []).map((m) => g.mat(m));
  // water level: never rises downstream, stays 1 below the lowest bank top around the centre line
  let y = o.startY;
  for (const p of S) {
    let lo = Infinity;
    if (!o.skip?.(Math.round(p.x), Math.round(p.z))) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) lo = Math.min(lo, o.topAt(Math.round(p.x + dx), Math.round(p.z + dz)));
    if (Number.isFinite(lo)) y = Math.min(y, lo - 1);
    y = Math.max(y, o.minY ?? 0);
    p.y = y;
  }
  const cells = nearField(S, (o.maxWidth ?? 3) + 2);
  const wOf = (p) => o.width(p.s / L);
  // channel + water
  const wet = new Map();
  for (const c of cells) {
    const p = S[c.i], w = wOf(p);
    if (c.d > w) continue;
    const top = o.topAt(c.x, c.z);
    if (!Number.isFinite(top) || o.skip?.(c.x, c.z)) continue;
    for (let yy = p.y + 1; yy <= Math.max(top, p.y + 1) + 2; yy++) { const id = g.get(c.x, yy, c.z); if (id && !o.keep?.(id)) g.set(c.x, yy, c.z, 0); }
    g.set(c.x, p.y, c.z, water);
    const deep = c.d < w * 0.45 && w > 1.6 ? 1 : 0;
    if (deep) g.set(c.x, p.y - 1, c.z, water);
    g.set(c.x, p.y - 1 - deep, c.z, bed);
    wet.set(`${c.x},${c.z}`, p.y);
  }
  // banks (muddy, a few wet stones) + foam where the water steps down
  for (const c of cells) {
    const p = S[c.i], w = wOf(p);
    if (c.d <= w || c.d > w + 1.6 || o.skip?.(c.x, c.z)) continue;
    const top = o.topAt(c.x, c.z);
    if (!Number.isFinite(top) || top < p.y - 3) continue;
    const id = g.get(c.x, top, c.z);
    if (o.bankOn && !o.bankOn.has(id)) continue;
    if (rockM.length && hash3(c.x, top, c.z, 71) < (o.rockChance ?? 0.12)) g.set(c.x, top + 1, c.z, rockM[Math.floor(hash3(c.x, 1, c.z, 72) * rockM.length)]);
    else g.set(c.x, top, c.z, bank);
  }
  for (const [k, wy] of wet) {
    const [x, z] = k.split(',').map(Number);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ny = wet.get(`${x + dx},${z + dz}`);
      if (ny != null && ny <= wy - 1 && hash3(x, wy, z, 73) < 0.75) g.set(x + dx, ny, z + dz, foam); // foam at the foot of a step
    }
  }
  return S;
}

/**
 * Boardwalk trail on low posts along pts ([x, z] from its low end to its high end): a 3-wide plank deck that never
 * goes down (stairs where it climbs), posts + a rope handrail on both sides, piles down to the ground.
 * topAt(x, z) → land top. Returns { samples (with deck y), deckAt(x, z) }.
 */
export function boardwalk(g, pts, o) {
  const S = sampleLine(pts, 0.5), half = o.half ?? 1.5;
  const M = (n) => g.mat(n);
  const tread = [M(o.plank ?? 'plank'), M(o.plankLight ?? 'plankLight')], post = M(o.post ?? 'beam'), rail = M(o.rail ?? 'fiberRope'), edge = M(o.edge ?? 'plankDark');
  // deck height: ground + lift, monotonic up the trail, rounded; optional overrides (bridges) by arc length
  let y = -Infinity;
  for (const p of S) {
    let hi = -Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) hi = Math.max(hi, o.topAt(Math.round(p.x + dx), Math.round(p.z + dz)));
    const want = hi + (o.lift ?? 1);
    y = Math.max(y, want);
    p.y = Math.round(y);
  }
  // end at endY: stairs up the last stretch (1 step per voxel)
  if (o.endY != null) { const L = S[S.length - 1].s; for (const p of S) p.y = Math.max(p.y, o.endY - Math.floor((L - p.s) / (o.endRun ?? 1.2))); }
  const cells = nearField(S, half + 1.2);
  const deck = new Map();
  for (const c of cells) {
    const p = S[c.i];
    if (c.d > half) continue;
    const k = `${c.x},${c.z}`;
    if (deck.has(k) && deck.get(k) >= p.y) continue;
    deck.set(k, p.y);
  }
  for (const [k, yy] of deck) {
    const [x, z] = k.split(',').map(Number);
    for (let h = yy + 1; h <= yy + (o.headroom ?? 3); h++) { const id = g.get(x, h, z); if (id && !o.keepAbove?.(id)) g.set(x, h, z, 0); } // headroom
    g.set(x, yy, z, tread[hash3(x, yy, z, 31) < 0.3 ? 1 : 0]);
    // fill under the edge of a step so risers read as stairs, piles under the rest
    const gt = o.topAt(x, z);
    if (Number.isFinite(gt) && yy - gt > 1 && (Math.abs(x) + Math.abs(z)) % 3 === 0) for (let h = gt + 1; h < yy; h++) g.set(x, h, z, post);
  }
  // rails: posts every ~3 along both sides, rope at post top − 1 between them
  for (const c of cells) {
    const p = S[c.i];
    if (c.d <= half || c.d > half + 1.05 || deck.has(`${c.x},${c.z}`)) continue;
    if (o.noRail?.(p)) continue;
    const yy = p.y, gt = o.topAt(c.x, c.z);
    const isPost = Math.floor(p.s / 3) !== Math.floor((p.s - 0.6) / 3) || hash3(c.x, 0, c.z, 33) < 0.08;
    if (isPost) {
      for (let h = Math.min(yy, Number.isFinite(gt) ? gt + 1 : yy); h <= yy + 2; h++) g.set(c.x, h, c.z, post);
    } else if (!g.get(c.x, yy + 2, c.z)) g.set(c.x, yy + 2, c.z, rail);
    if (!g.get(c.x, yy, c.z)) g.set(c.x, yy, c.z, edge);
  }
  return { samples: S, deckAt: (x, z) => deck.get(`${x},${z}`) };
}

/**
 * Seated golden Buddha in a dark arched niche carved into the rock behind it, facing `face` ('+x'…): a wide low
 * silhouette (lap 7 wide × 2, arms, 3-wide chest, 3×3×3 head with curled hair, 1-voxel ushnisha), a saffron sash
 * draped diagonally over the shoulder, a lotus base on a stone plinth, a marigold garland, and an offering step with
 * flickering butter lamps, incense and a lotus bud. p = [x, y, z] standing cell of the plinth centre (plinth at y).
 * M: gold goldLight goldDark sash plinth lotus marigold petal lamp lampCup incense incenseTip lotusBud rock dark.
 */
export function buddha(g, p, face, M) {
  const [fx, fz] = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[face];
  const ux = -fz, uz = fx; // across
  const X = (u, v) => p[0] + ux * u + fx * v, Z = (u, v) => p[2] + uz * u + fz * v;
  const at = (u, y, v, m) => g.set(X(u, v), p[1] + y, Z(u, v), m);
  const get = (u, y, v) => g.get(X(u, v), p[1] + y, Z(u, v));
  // the niche: an arched recess in a rock backing (built where the cave wall is missing), dark at the back
  for (let u = -6; u <= 6; u++) for (let y = 0; y <= 14; y++) {
    const arch = (u / 4.7) ** 2 + ((y - 0.5) / 12.5) ** 2 <= 1;
    for (const v of [-4, -5, -6]) {
      if (arch && v === -4) { at(u, y, v, y === 0 ? M.plinth : 0); continue; }
      if (arch && v === -5) { at(u, y, v, M.dark); continue; }
      if (!get(u, y, v)) at(u, y, v, M.rock);
    }
  }
  // plinth + lotus base
  for (let u = -4; u <= 4; u++) for (let v = -3; v <= 2; v++) at(u, 0, v, M.plinth);
  for (let u = -4; u <= 4; u++) for (let v = -2; v <= 1; v++) at(u, 1, v, Math.abs(u) === 4 || v === 1 || v === -2 ? M.lotus : M.goldDark);
  // crossed legs: the lap, 7 wide and 2 tall; hands resting in it
  for (let u = -3; u <= 3; u++) for (let v = -1; v <= 1; v++) for (let y = 2; y <= 3; y++) at(u, y, v, M.gold);
  for (let u = -1; u <= 1; u++) at(u, 3, 1, M.goldLight);
  // arms + belly, sloping shoulders: 5 wide at y 4–5, 3 wide at y 6; a slim neck
  for (let u = -2; u <= 2; u++) for (let v = -1; v <= 0; v++) for (let y = 4; y <= 5; y++) at(u, y, v, M.gold);
  for (let u = -1; u <= 1; u++) for (let v = -1; v <= 0; v++) at(u, 6, v, M.gold);
  at(0, 7, 0, M.goldDark);
  // head 3×3 (y 8–10): face, downcast eyes, long ear lobes, curled hair, ushnisha
  for (let u = -1; u <= 1; u++) for (let v = -1; v <= 1; v++) { at(u, 8, v, M.gold); at(u, 9, v, M.gold); at(u, 10, v, M.goldDark); }
  at(-1, 9, 1, M.goldDark); at(1, 9, 1, M.goldDark);
  at(-2, 8, 0, M.goldDark); at(2, 8, 0, M.goldDark); at(-2, 9, 0, M.goldDark); at(2, 9, 0, M.goldDark);
  at(0, 11, 0, M.goldLight);
  // saffron sash: over the left shoulder, diagonally across the chest to the right hip
  for (const [u, y] of [[1, 6], [0, 6], [0, 5], [-1, 5], [-1, 4], [-2, 4]]) at(u, y, 0, M.sash);
  at(1, 6, -1, M.sash); at(2, 5, -1, M.sash); at(2, 5, 0, M.sash);
  // marigold garland draped over the lap
  for (let u = -2; u <= 2; u++) at(u, 2, 2, u === 0 ? M.petal : M.marigold);
  // offering step: butter lamps (brass cups + flames), incense, a lotus bud
  for (let u = -4; u <= 4; u++) at(u, 0, 3, M.plinth);
  for (const [u, v] of [[-3, 3], [3, 3], [-4, 2], [4, 2]]) { at(u, 1, v, M.lampCup); at(u, 2, v, M.lamp); }
  at(-2, 1, 3, M.incense); at(-2, 2, 3, M.incenseTip); at(2, 1, 3, M.incense); at(2, 2, 3, M.incenseTip); at(0, 1, 3, M.lotusBud);
  return { front: [X(0, 5), p[1], Z(0, 5)], top: [p[0], p[1] + 10, p[2]] };
}

/** Small wooden trail sign on two posts with a pixel-art bat on it, under a little thatch hood, facing `face`.
 *  p = centre on the ground. ~11 wide incl. the hood, 10 tall. */
export function batSign(g, p, face, M) {
  const [fx, fz] = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[face];
  const ux = -fz, uz = fx;
  const at = (u, y, v, m) => g.set(p[0] + ux * u + fx * v, p[1] + y, p[2] + uz * u + fz * v, m);
  for (let y = 0; y <= 7; y++) { at(-4, y, 0, M.post); at(4, y, 0, M.post); }
  for (let u = -3; u <= 3; u++) for (let y = 3; y <= 7; y++) at(u, y, 0, y === 3 || y === 7 ? M.boardDark : M.board);
  // bat silhouette (wings spread) on the front face
  const bat = ['X.X.X.X', 'XXXXXXX', '.X.X.X.'];
  bat.forEach((row, r) => [...row].forEach((c, i) => { if (c === 'X') at(i - 3, 6 - r, 1, M.ink); }));
  at(-1, 7, 1, M.ink); at(1, 7, 1, M.ink); // ears
  for (let u = -5; u <= 5; u++) { at(u, 8, 0, M.roof); at(u, 8, 1, M.roofDark); at(u, 8, -1, M.roofDark); }
  for (let u = -4; u <= 4; u++) at(u, 9, 0, M.roof);
}

export { clamp };
