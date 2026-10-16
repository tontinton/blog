// Lake region, the underwater half — seen through the glass cutaway walls (x = 119, z = 119) and, dimly, from above:
// a patterned lake bed, drowned trees (the snags' trunks run down to splayed roots on the bed) and stumps, fallen
// trunks, algae rocks, waterweed, the drowned village (a whitewashed bell chedi whose gilt finial breaks the surface,
// old house posts — Cheow Lan flooded five villages in 1982), a sunken long-tail boat, bamboo fish traps. The camera looks down ~27°, so through the +z
// wall it sees ~2–15 voxels behind the glass (z ≥ ~104), through the +x wall x ≥ ~106: the set pieces live there,
// curated (few, legible shapes) rather than scattered.
import { VoxelGrid, longtail, rock, hash3, clamp } from '../../lib/index.js';
import { LAKE_Y } from '../layout.js';

const W = LAKE_Y;

// submerged stumps [x, z, top y, radius]
const STUMPS = [[63, 117, -4, 1.2], [72, 112, -2, 1.3], [49, 113, -5, 1.1], [65, 101, -6, 0.9], [116, 88, -5, 1.2]];
const ROCKS = [[48, 114, 2.2], [115, 51, 2], [116, 83, 2.6], [113, 93, 1.8], [100, 109, 1.6], [56, 118, 1.5], [117, 74, 1.4]];
const LOGS = [[[107, 82], [117, 94], 1.0], [[44, 100], [52, 106], 0.9]];
export const CHEDI = [86, 114];   // 5 behind the +z glass (its base reaches 1 short of it)
export const BOAT = [102, 115];
export const TRAPS = [[114, 66], [115, 72], [113, 78]];

export function underwater(g, ctx, { bedY, hook }) {
  const [[X0, , Z0], [X1, , Z1]] = ctx.box, N = ctx.noise;
  const P = ctx.P, water = (x, y, z) => { const id = g.get(x, y, z); return id && P.isTransparent(id); };
  const edge = (x, z) => Math.min(x - X0, z - Z0);                 // distance to the seams (x = 40 / z = 40)
  const win = (x, z) => z >= 100 || x >= 105;                       // seen through the glass

  // ---- the bed: mud patches, rippled sand (lighter behind the glass, so shapes read against it), pebbles, shells ----
  for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) {
    const e = edge(x, z);
    if (e < 3) continue;
    const y = bedY(x, z), fade = clamp((e - 3) / 6, 0, 1);
    const n = N.fbm2(x * 0.06 + 7, z * 0.06 - 3, { octaves: 3 }) - (win(x, z) ? 0.3 : 0);   // a sandy aquarium floor behind the glass
    const h = hash3(x, y, z, 77);
    const ripple = Math.round(x * 0.7 + z * 0.45 + N.simplex2(x * 0.1, z * 0.1) * 2) % 3 === 0;
    if (n > 0.28 + (1 - fade) * 0.5) g.set(x, y, z, 'lake_mud');
    else if (n < -0.25 - (1 - fade) * 0.5) g.set(x, y, z, ripple ? 'lake_sandDark' : 'sandJ');
    if (z >= Z1 - 6 && x >= X0 + 6) g.set(x, y, z, 'sandJ');                    // a plain pale sand strip behind the +z glass
    if (fade < 1) continue;
    if (h < 0.006 && water(x, y + 1, z)) g.set(x, y + 1, z, 'lake_pebble');
    else if (h > 0.996 && water(x, y + 1, z)) g.set(x, y + 1, z, 'lake_shell');
  }

  // ---- stumps, fallen trunks, rocks ----
  for (const [x, z, top, r] of STUMPS) drownedTree(g, [x, bedY(x, z), z], top, r, { seed: x * 13 + z, branches: 0 });
  for (const [a, b, r] of LOGS) {
    const ya = bedY(...a) + r * 0.5, yb = bedY(...b) + r * 0.5;
    g.tube([[a[0], ya, a[1]], [(a[0] + b[0]) / 2, Math.max(ya, yb) + 0.3, (a[1] + b[1]) / 2], [b[0], yb, b[1]]], (x, y, z) => (hash3(x, y, z, 3) < 0.35 ? 'lake_algae' : 'lake_drownedWood'), { r, r2: r * 0.75 });
    const m = [(a[0] * 2 + b[0]) / 3, Math.max(ya, yb) + r, (a[1] * 2 + b[1]) / 3];
    g.line(m, [m[0] + 1, m[1] + 3, m[2] - 1], 'lake_drownedWood', { r: 0.5 });   // a broken branch stub
  }
  for (const [x, z, s] of ROCKS) rock(g, [x, bedY(x, z) + 1, z], { size: [s, s * 0.8, s * 0.9], stone: ['limestoneDark', 'limestoneNotch', 'limestone'], moss: 'lake_algae', bury: 0.3, seed: x * 31 + z });

  // ---- the drowned village: chedi + house posts; the sunken long-tail; bamboo fish traps ----
  const zone = chedi(g, [CHEDI[0], bedY(...CHEDI), CHEDI[1]], bedY);
  village(g, bedY);
  snakehead(g, hook, bedY);
  sunkenBoat(g, ctx, BOAT, bedY);
  bubbles(g, [BOAT[0] - 2, bedY(BOAT[0] - 2, BOAT[1]) + 4, BOAT[1]], 77); bubbles(g, [BOAT[0] + 3, bedY(BOAT[0] + 3, BOAT[1]) + 3, BOAT[1] - 1], 78);
  for (const [x, z] of TRAPS) fishTrap(g, [x, bedY(x, z) + 1, z]);

  // ---- waterweed: a few clumps (curated near the glass + a sparse scatter on the open bed), never single-strand noise ----
  const clumps = [[61, 115], [118, 100], [117, 89], [118, 60], [113, 106], [58, 103], [73, 107], [66, 96]];
  for (let i = 0; i < 8; i++) { const x = X0 + 8 + Math.floor(hash3(i, 7, 3, 95) * 50), z = Z0 + 8 + Math.floor(hash3(i, 8, 3, 95) * 45); clumps.push([x, z]); }
  clumps.forEach(([cx0, cz0], ci) => {
    const n = 3 + Math.floor(hash3(ci, 1, 0, 96) * 4), red = hash3(ci, 2, 0, 96) < 0.2;
    for (let k = 0; k < n * 2; k++) {
      const a = hash3(ci, k, 1, 97) * 6.28, d = hash3(ci, k, 2, 97) * 2.2, x = Math.round(cx0 + Math.cos(a) * d), z = Math.round(cz0 + Math.sin(a) * d);
      if (x > X1 || z > Z1 || zone(x, z)) continue;                     // nothing grows round the chedi
      const y = bedY(x, z) + 1;
      if (!water(x, y, z)) continue;
      const tall = 2 + Math.floor(hash3(x, 5, z, 94) * 6 * (1 - d / 3.2));
      let px = x;
      for (let i = 0; i < tall; i++) {
        const yy = y + i;
        if (yy > W - 2 || !water(px, yy, z)) break;
        g.set(px, yy, z, red ? 'lake_weedRed' : i >= tall - 2 ? 'lake_weedLight' : 'lake_weed');
        if (i === tall - 3 && hash3(x, 3, z, 93) < 0.5 && px < X1) px += 1;     // bent by the current
      }
    }
  });
}

// below the waterline drowned wood stays pale (reads against the bed through the glass): ~70% snag, 25% wood, 6% algae
const under = (x, y, z) => { const h = hash3(x, y, z, 4); return h < 0.06 ? 'lake_algae' : h < 0.31 ? 'lake_drownedWood' : 'lake_snag'; };

/** A drowned tree from the lake bed: splayed pale roots, a pale trunk underwater, a dark wet ring at the waterline,
 *  weathered grey wood above with a dark, splintered top and a few stubby branches. top = top y (≤ W − 2: a submerged
 *  stump). → { base, top, perch, branches } */

export function drownedTree(g, [x, by, z], top, r, o = {}) {
  const seed = o.seed ?? 1, H = top - by;
  const la = hash3(x, 0, z, seed) * Math.PI * 2, lean = top > W ? (o.lean ?? hash3(x, 1, z, seed) * 0.07) : 0;
  const cx = (y) => x + Math.cos(la) * lean * Math.max(0, y - W), cz = (y) => z + Math.sin(la) * lean * Math.max(0, y - W);
  const ring = 1 + (hash3(x, 2, z, seed) < 0.5 ? 1 : 0);
  const mat = (px, y, pz) => {
    if (y > W + ring) return y > top - 2 && top > W + 2 ? 'lake_snagDark' : hash3(px, Math.floor((y + hash3(px, 0, pz, 5) * 9) / 4), pz, 6) < 0.22 ? 'lake_snagDark' : 'lake_snag';
    if (y >= W - 1) return 'deadWoodWet';
    return under(px, y, pz);
  };
  for (let y = by + 1; y <= top; y++) {
    const t = clamp((y - by) / Math.max(1, H)), flare = y <= by + 2 ? 0.45 * (by + 3 - y) / 2 : 0;
    const rr = r * (1 - 0.3 * t) + flare, x0 = cx(y), z0 = cz(y);
    if (rr < 0.7) { g.set(Math.round(x0), y, Math.round(z0), mat(Math.round(x0), y, Math.round(z0))); continue; }
    for (let pz = Math.floor(z0 - rr); pz <= Math.ceil(z0 + rr); pz++) for (let px = Math.floor(x0 - rr); px <= Math.ceil(x0 + rr); px++) {
      if ((px - x0) ** 2 + (pz - z0) ** 2 > rr * rr + 0.05) continue;
      const fromTop = top - y;
      if (fromTop < 3 && hash3(px, 0, pz, seed + 9) * 3.2 > fromTop + 0.4 && !(px === Math.round(x0) && pz === Math.round(z0))) continue; // splinters
      g.set(px, y, pz, mat(px, y, pz));
    }
  }
  // roots splayed over the bed
  const nr = r > 1.1 ? 4 : 3, a0 = hash3(x, 3, z, seed) * 6.28;
  for (let i = 0; i < nr; i++) {
    const a = a0 + (i / nr) * Math.PI * 2 + (hash3(x, i, z, seed + 1) - 0.5) * 0.6, L = r + 1.5 + hash3(x, i, z, seed + 2) * 2;
    g.tube([[x, by + 1 + r, z], [x + Math.cos(a) * L * 0.55, by + 1, z + Math.sin(a) * L * 0.55], [x + Math.cos(a) * L, by + 0.4, z + Math.sin(a) * L]], under, { r: 0.65, r2: 0.5 });
  }
  // a few stubby, upswept branches above the water
  const branches = [];
  const nb = top > W + 5 ? o.branches ?? (1 + Math.floor(hash3(x, 4, z, seed) * 2)) : 0;
  for (let i = 0; i < nb; i++) {
    const y = Math.round(W + 2 + (top - W - 3) * (0.45 + 0.4 * hash3(x, i, z, seed + 3))), a = hash3(x, i, z, seed + 4) * 6.28, L = 2 + hash3(x, i, z, seed + 5) * 2.5;
    const s = [cx(y), y, cz(y)], e = [s[0] + Math.cos(a) * (L + r * 0.5), y + L * 0.8, s[2] + Math.sin(a) * (L + r * 0.5)];
    g.line(s, e, 'lake_snag');
    branches.push(e.map(Math.round));
  }
  const tp = [Math.round(cx(top)), top, Math.round(cz(top))];
  const perch = branches.length ? branches.reduce((A, B) => (B[1] > A[1] ? B : A)) : tp;
  return { base: [x, by, z], top: tp, perch, branches };
}

/** A weathered bell chedi on the bed: bare warm brick (it survives the cool water tint) in coherent patches, whitewash
 *  remnants on the upper bell and the terrace edges, a ringed spire up through the surface: a gilt plus-ring at W + 1
 *  hung with two marigolds on the camera side, a gilt needle to W + 4, a lighter gold tip at W + 5 (drowned temple
 *  spires do show above Thai reservoirs). The bed within 5 of its base is plain dark silt (no weed or algae), so it
 *  silhouettes. → zone(x, z): that cleared ring. */
function chedi(g, [cx, by, cz], bedY) {
  const P = g.palette, H = 5;
  const zone = (x, z) => Math.abs(x - cx) <= 4 + H && Math.abs(z - cz) <= 4 + H;
  for (let x = cx - 4 - H; x <= cx + 4 + H; x++) for (let z = cz - 4 - H; z <= cz + 4 + H; z++) {
    const y = bedY(x, z), above = g.get(x, y + 1, z);
    g.set(x, y, z, 'lake_mud');
    if (above && !P.isTransparent(above)) { const nm = P.def(above).name; if (nm === 'lake_pebble' || nm === 'lake_shell' || nm === 'lake_algae' || nm?.startsWith('lake_weed')) g.set(x, y + 1, z, g.get(x, y + 2, z) || 'lakeClear'); }
  }
  const patch = (x, y, z) => hash3(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2), 24);   // 2×2×2 coherent blocks
  const mat = (x, y, z, upper, rim) => (patch(x, y, z) < (upper ? 0.45 : rim ? 0.35 : 0.12) ? 'lake_stucco' : 'lake_brick');
  const broken = (x, y, z) => hash3(Math.floor(x / 2), y, Math.floor(z / 2), 22) < 0.06;
  let y = by + 1;
  for (const hw of [4, 4, 3]) {                                       // square terraces
    for (let x = cx - hw; x <= cx + hw; x++) for (let z = cz - hw; z <= cz + hw; z++) {
      const rim = Math.abs(x - cx) === hw || Math.abs(z - cz) === hw;
      if (y > by + 1 && rim && broken(x, y, z)) continue;
      g.set(x, y, z, mat(x, y, z, false, rim));
    }
    y++;
  }
  const bell0 = y;
  for (const r of [3.6, 3.5, 3.1, 2.3]) {                           // the bell
    for (let x = cx - 4; x <= cx + 4; x++) for (let z = cz - 4; z <= cz + 4; z++) if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r + 0.2) g.set(x, y, z, mat(x, y, z, y >= bell0 + 2, false));
    y++;
  }
  g.box([cx - 1, y, cz - 1], [cx + 1, y, cz + 1], 'lake_stucco'); y++; // harmika
  const plus = (yy, m) => { for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(cx + dx, yy, cz + dz, m); };
  for (; y <= W; y++) { g.set(cx, y, cz, (y & 1) ? 'lake_brick' : 'lake_stucco'); if ((y - W) % 2 === 0) plus(y, 'lake_brick'); }   // ringed spire up through the surface
  g.set(cx, W + 1, cz, 'lake_gilt'); plus(W + 1, 'lake_gilt');                                                // the gilt plus-ring
  g.set(cx + 1, W + 1, cz, 'marigold'); g.set(cx, W + 1, cz + 1, 'marigold');                                 // a garland on the camera side
  for (let yy = W + 2; yy <= W + 4; yy++) g.set(cx, yy, cz, 'lake_gilt');                                     // the needle
  g.set(cx, W + 5, cz, 'templeGold');                                                                         // its tip
  // the fallen finial of an older top on the bed (outside the cleared ring), offering jars at the base
  g.box([cx - 11, bedY(cx - 11, cz - 2) + 1, cz - 2], [cx - 10, bedY(cx - 10, cz - 2) + 1, cz - 2], 'lake_brick');
  for (const [dx, dz] of [[-5, 3], [5, -3], [3, -5]]) g.set(cx + dx, bedY(cx + dx, cz + dz) + 1, cz + dz, 'thaiClay');
  return zone;
}

/** A giant snakehead (pla chado, ~11 long) hanging just off the bed beside the chedi, nosing the boy's bait: dark olive
 *  back, blotched flanks, a pale belly, a red eye on the camera side; the hook and bait 3 above the bed. hook = [x, z]. */
function snakehead(g, [hx, hz], bedY) {
  const hy = bedY(hx, hz) + 3;
  g.set(hx, hy, hz, 'lake_bait'); g.set(hx, hy + 1, hz, 'lake_hook'); g.set(hx, hy - 1, hz, 'lake_bait');   // a worm on the hook
  const fy = hy - 2, z0 = hz - 1, x1 = hx - 1;                        // snout at the bait, body trailing west, 4 rows tall
  for (let i = 0; i < 11; i++) {
    const x = x1 - i, head = i < 2, tail = i > 8;
    for (let z = z0; z <= z0 + 1; z++) {
      if (!tail || i === 9) g.set(x, fy, z, i % 3 === 1 ? 'lake_snakeheadMid' : 'lake_snakeheadBelly');        // belly
      for (const dy of [1, 2]) g.set(x, fy + dy, z, hash3(Math.floor(x / 2), fy + dy, z, 25) < 0.4 ? 'lake_snakehead' : 'lake_snakeheadMid');   // blotched flank
      if (!head || i === 1) g.set(x, fy + 3, z, 'lake_snakehead');                                               // dark back
    }
    if (i >= 3 && i <= 8) g.set(x, fy + 4, z0, 'lake_snakehead');                                                 // the long dorsal fin
  }
  g.set(x1, fy + 2, z0 + 1, 'lake_snakeheadEye');                                                                // red eye, camera side
  for (const dy of [0, 1, 2, 3, 4]) g.set(x1 - 11, fy + dy, z0, 'lake_snakehead');                              // tail fin
  g.set(x1 - 2, fy - 1, z0 + 1, 'lake_snakeheadMid');                                                            // pectoral fin
}

/** Old house posts of the drowned village (a stilt house long gone), a fallen beam, jars. */
function village(g, bedY) {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const x = 71 + i * 3, z = 103 + j * 3;
    if (hash3(x, 0, z, 31) < 0.22) continue;
    const by = bedY(x, z), h = 2 + Math.floor(hash3(x, 1, z, 32) * 5);
    for (let y = by + 1; y <= by + h; y++) g.set(x, y, z, hash3(x, y, z, 33) < 0.4 ? 'lake_algae' : 'lake_post');
  }
  g.line([71, bedY(71, 104) + 1, 103], [77, bedY(77, 108) + 2, 109], 'lake_post');
  g.line([74, bedY(74, 107) + 3, 107], [76, bedY(76, 105) + 1, 105], 'lake_drownedWood');
  for (const [x, z] of [[69, 110], [76, 101]]) { const y = bedY(x, z) + 1; g.set(x, y, z, 'thaiClay'); g.set(x, y + 1, z, 'thaiClay'); }
}

/** A long-tail boat lying on the bed, bow down and listing, algae on the hull, silt and weed inside. */
function sunkenBoat(g, ctx, [cx, cz], bedY) {
  const P = ctx.P, S = new VoxelGrid(P);
  longtail(S, [0, 0, 0], { dir: '+x', length: 16, shaft: 1, passengers: 0, driver: false, canopy: false, seed: 42 });
  const remap = { longtailHull: 'lake_sunkHull', longtailHullDark: 'lake_sunkHull', longtailPaint: 'lake_sunkPaint', engineMetal: 'lake_rust', metalDark: 'lake_rust', marigold: 'lake_algae', ribbonRed: 'ribbonRed', ribbonYellow: 'lake_algae', ribbonPink: 'lake_weedRed', ribbonGreen: 'lake_weed', templeGold: 'lake_gilt', templeRed: 'lake_rust', plank: 'lake_drownedWood', plankDark: 'lake_drownedWood', plankLight: 'lake_drownedWood' };
  const yAt = (x, z) => bedY(cx + x, cz + z) + 2 + Math.round(-x * 0.13) + (z > 0 ? 1 : 0);   // bow down, listing to −z
  S.forEach((x, y, z, id) => {
    const wy = yAt(x, z) + y;
    if (wy <= bedY(cx + x, cz + z) || wy > W - 2) return;                                     // buried / never breaks the surface
    g.set(cx + x, wy, cz + z, remap[P.def(id).name] ?? id);
  });
  // silt drifted into the hull, weed growing out of it
  for (let x = -5; x <= 4; x++) for (const z of [-1, 0]) {
    const wy = yAt(x, z);
    const id = g.get(cx + x, wy, cz + z);
    if (!id || P.isTransparent(id)) g.set(cx + x, wy, cz + z, 'silt');
    if (hash3(x, 0, z, 61) < 0.15) for (let k = 1; k <= 1 + Math.floor(hash3(x, 1, z, 62) * 3); k++) g.set(cx + x, wy + k, cz + z, k > 1 ? 'lake_weedLight' : 'lake_weed');
  }
}

/** Bamboo cylinder fish trap lying on the bed along z, a rope up to a bamboo float with an orange buoy. */
function fishTrap(g, [x, y, z]) {
  for (let v = -2; v <= 2; v++) for (let dy = 0; dy <= 2; dy++) for (let du = -1; du <= 1; du++) {
    const shell = Math.abs(du) === 1 || dy === 0 || dy === 2, end = Math.abs(v) === 2;
    if (!shell && !end) continue;
    if (end && !shell && v === 2) continue;                       // the funnel mouth
    if (!end && dy === 1 && (du + v) % 2) continue;                // woven gaps
    g.set(x + du, y + dy, z + v, (v + dy) % 2 ? 'bambooPoleDark' : 'bambooPole');
  }
  const fx = Math.min(x + 2, 117);
  g.line([x, y + 3, z - 2], [fx, W - 1, z - 3], 'fiberRope');
  g.box([fx, W, z - 4], [fx, W, z - 2], 'bambooPole');
  g.set(fx, W + 1, z - 3, 'lake_buoy');
}

/** A trail of air bubbles rising from p to just under the surface (single bright voxels, wobbling, spaced apart). */
function bubbles(g, [x, y, z], seed) {
  for (let yy = y + 1, i = 0; yy <= W - 1; i++) {
    const w = hash3(x, yy, z, seed);
    const bx = x + (w < 0.25 ? -1 : w > 0.75 ? 1 : 0), bz = z + (hash3(z, yy, x, seed) < 0.3 ? 1 : 0);
    if (!g.get(bx, yy, bz) || ctxClear(g, bx, yy, bz)) g.set(bx, yy, bz, 'lake_bubble');
    yy += 1 + (i % 2) + Math.floor(w * 1.5);
  }
}
const ctxClear = (g, x, y, z) => { const id = g.get(x, y, z); return id && g.palette.isTransparent(id); };
