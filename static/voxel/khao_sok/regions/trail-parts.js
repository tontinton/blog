// trail region helpers: the jungle trail (painted path + log steps + markers), the ranger station on stilts,
// the Thai flag, the arched footbridge, the rafflesia viewing deck. Imported by trail.js only.
import { spline, hash3, clamp, person } from '../../lib/index.js';

export const TRAIL_MATS = {
  trail_path: { colors: ['#b07a50', '#a46e48', '#ba865a'], jitter: 0.05, noise: { color: '#8c5c3c', scale: 0.18, amount: 0.6 } },
  trail_pathEdge: { colors: ['#8a6a44', '#7e603e', '#94744a'], jitter: 0.06 },
  trail_root: { color: '#5a4230', jitter: 0.05 },
  trail_plaza: { colors: ['#c09468', '#b68c62', '#c89e70'], jitter: 0.05, noise: { color: '#a07a50', scale: 0.12, amount: 0.5 } },
  trail_khaki: { color: '#8e7e4e', jitter: 0.03 },
  trail_olive: { color: '#46502e', jitter: 0.03 },
  trail_hatKhaki: { color: '#a8946a', jitter: 0.03 },
  trail_flagRed: { color: '#d0242e', jitter: 0.02, sway: 0.35 },
  trail_flagWhite: { color: '#f4f2ee', jitter: 0.02, sway: 0.35 },
  trail_flagBlue: { color: '#26286a', jitter: 0.02, sway: 0.35 },
  trail_pole: { color: '#e8e6e0', jitter: 0.02 },
  trail_teak: { color: '#8a5632', jitter: 0.05, noise: { color: '#74462a', scale: 0.4, amount: 0.5 } },
  trail_teakLight: { color: '#a8703e', jitter: 0.05 },
  trail_markRed: { color: '#d03a2a', jitter: 0.02 },
  trail_markWhite: { color: '#f0ece2', jitter: 0.02 },
  trail_mapGreen: { color: '#4f8a46', jitter: 0.02 },
  trail_mapBlue: { color: '#4aa0c0', jitter: 0.02 },
  trail_bikeRed: { color: '#b8282e', jitter: 0.03, roughness: 0.4 },
  trail_lamp: { color: '#fff4c0', emissive: 1.5 },
  trail_led: { color: '#5a1612', jitter: 0.02 },                // camera-trap status light (off)
  trail_skin: { color: '#d8a47a', jitter: 0.03 },
  trail_palm: { color: '#2e5e2e', jitter: 0.05, sway: 0.25 },
  trail_palmDark: { color: '#244e26', jitter: 0.05, sway: 0.25 },
  trail_sock: { color: '#e6dcc0', jitter: 0.03 },                 // leech socks
  trail_boot: { color: '#1c1c1e', jitter: 0.02, roughness: 0.5 }, // rubber boots
  trail_mud: { color: '#5e4630', jitter: 0.05 },
  trail_print: { color: '#38281a', jitter: 0.04 },               // tiger pugmarks in the mud
  trail_palmUnder: { color: '#b4c2ae', jitter: 0.04, sway: 0.25 },   // Kerriodoxa's silver-white leaf underside
  trail_tank: { color: '#3a6ab0', jitter: 0.03, roughness: 0.4 },
  trail_rot: { color: '#3a1e18', jitter: 0.05 },          // a spent, blackened rafflesia
  trail_rotDark: { color: '#24140f', jitter: 0.05 },
  trail_rotSpot: { color: '#6e5040', jitter: 0.05 },
};

const K = (x, z) => x + ',' + z;

/**
 * A trail along control points [[x, z], …]: returns { cells: Map(key → { x, z, d }), line: [[x, z], …] (smoothed
 * centreline, ~1 voxel apart) }. width = full width (3).
 */
export function trailCells(pts, width = 3) {
  const sm = spline(pts.map(([x, z]) => [x, 0, z]), 8);
  const line = [];
  for (const p of sm) { const q = [p[0], p[2]]; if (!line.length || Math.hypot(q[0] - line[line.length - 1][0], q[1] - line[line.length - 1][1]) >= 0.7) line.push(q); }
  const cells = new Map(), r = width / 2;
  for (const [cx, cz] of line) {
    for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r + 1); z++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - cx - 0.5, z + 0.5 - cz - 0.5);
      if (d > r) continue;
      const c = cells.get(K(x, z));
      if (!c || d < c.d) cells.set(K(x, z), { x, z, d });
    }
  }
  return { cells, line };
}

/** Thin a smoothed line to ~every `step` voxels (actor paths). */
export const thin = (line, step = 2.5) => {
  const out = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
    if (acc >= step) { out.push(line[i].map((v) => Math.round(v * 10) / 10)); acc = 0; }
  }
  return out;
};

/** The Thai flag on a white pole: pole foot p (standing cell), flag flying toward +x (dir) in the xy plane. */
export function thaiFlag(g, p, o = {}) {
  const H = o.height ?? 18, W = o.w ?? 9, dir = o.dir ?? 1;
  const [x, y, z] = p;
  g.box([x - 1, y, z - 1], [x + 1, y, z + 1], 'stoneLight');
  for (let k = 0; k <= H; k++) g.set(x, y + 1 + k, z, 'trail_pole');
  g.set(x, y + H + 2, z, 'templeGold');
  // raise (0..1): how far up the pole the flag is (the 8 o'clock flag-raising: on its way up, ~2/3)
  const top = y + 1 + Math.round(5 + (H - 5) * (o.raise ?? 1));
  const rows = ['trail_flagRed', 'trail_flagWhite', 'trail_flagBlue', 'trail_flagBlue', 'trail_flagWhite', 'trail_flagRed'];
  for (let i = 0; i < W; i++) {
    const wave = Math.round(Math.sin(i * 0.8) * 0.6 + (i > W * 0.6 ? 0.4 : 0));
    const sag = i > W - 3 ? 1 : 0;
    rows.forEach((m, r) => g.set(x + dir * (i + 1), top - r - sag, z + wave, m));
  }
  // halyard: from the pulley at the top down to the flag, and from the flag down to the hands of whoever hauls it
  if (o.halyard) {
    for (let yy = top + 1; yy <= y + H + 1; yy++) g.set(x, yy, z + 1, 'fiberRope');   // on the camera side of the pole
    for (let yy = o.halyard; yy <= top - 6; yy++) g.set(x, yy, z + 1, 'fiberRope');
    g.set(x + dir, top + 1, z + 1, 'fiberRope'); g.set(x + dir, top - 6, z + 1, 'fiberRope');
  }
  return { top };
}

/** A hiker frozen mid-step (one leg forward, arms swinging) with a day pack. p = lower across-axis cell (as person()). */
export function hikerStep(g, p, o = {}) {
  const side = o.side ?? '+z', [fx, fz] = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[side];
  const ax = fz !== 0 ? 1 : 0, az = fx !== 0 ? 1 : 0;
  const at = (a, y, d = 0) => [p[0] + ax * a + fx * d, p[1] + y, p[2] + az * a + fz * d];
  const put = (q, m) => g.set(q[0], q[1], q[2], m);
  const { skin = 'trail_skin', shirt, pants = 'trail_olive', hair = 'beam', pack = 'awningRed' } = o;
  put(at(0, 0, 1), 'metalDark'); put(at(0, 1, 0), pants);           // front leg (boot forward)
  put(at(1, 0, -1), 'metalDark'); put(at(1, 1, 0), pants);          // back leg
  for (const a of [0, 1]) { put(at(a, 2), shirt); put(at(a, 3), shirt); put(at(a, 4), skin); put(at(a, 5), skin); put(at(a, 6), o.hat ?? hair); put(at(a, 5, -1), hair); }
  put(at(-1, 3), shirt); put(at(-1, 2, -1), skin);                    // arm swinging back
  put(at(2, 3), shirt); put(at(2, 2, 1), skin);                       // arm swinging forward
  for (const a of [0, 1]) { put(at(a, 2, -1), pack); put(at(a, 3, -1), pack); }
  put(at(0, 4, -1), pack);
}

/** A closed rafflesia bud about to open (the next bloom): a maroon cabbage knob ~4 wide × 3 tall with dark bracts. */
export function rafflesiaBud(g, p) {
  const [x, y, z] = p;
  for (let dz = -1; dz <= 2; dz++) for (let dx = -1; dx <= 2; dx++) {
    const corner = (dx === -1 || dx === 2) && (dz === -1 || dz === 2);
    if (corner) { g.set(x + dx, y, z + dz, 'trail_rotDark'); continue; }
    const rim = dx === -1 || dx === 2 || dz === -1 || dz === 2;
    g.set(x + dx, y, z + dz, rim ? 'trail_rotDark' : 'rafflesiaDark');
    g.set(x + dx, y + 1, z + dz, rim ? ((dx + dz) & 1 ? 'trail_rotDark' : 'rafflesiaBudDark') : 'rafflesiaDark');
    if (!rim) g.set(x + dx, y + 2, z + dz, (dx + dz) & 1 ? 'rafflesiaCore' : 'rafflesiaDark');
  }
  g.set(x, y + 2, z - 1, 'trail_rotDark'); g.set(x + 1, y + 2, z + 2, 'trail_rotDark');   // bract tips curling over
}

/**
 * Kerriodoxa elegans (white elephant palm, endemic to Khao Sok): a short dark trunk and a crown of 8–10 big round fan
 * leaves, dark green above with a silvery-white underside row. p = standing cell. opts: trunk (3–4), leaves (8–10), seed.
 */
export function fanPalm(g, p, o = {}) {
  const [x0, y0, z0] = p, T = o.trunk ?? 3, n = o.leaves ?? 7, L = o.length ?? 5, a0 = ((o.seed ?? 1) * 0.37) % (Math.PI * 2);
  for (let y = 0; y < T; y++) g.set(x0, y0 + y, z0, y % 2 ? 'treeFernTrunk' : 'treeFernTrunkLight');
  const cy = y0 + T;
  g.set(x0, cy, z0, 'trail_palm');
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const lift = k % 2 ? 1 : 0;
    for (let r = 1; r <= L; r++) {
      const w = r < 2 ? 0 : 0.3 + (r - 1) * 0.5, y = cy + lift + Math.min(2, r) - Math.max(0, r - (L - 1));   // petiole up, fan held out, tip drooping
      let j = 0;
      for (let s = -w; s <= w + 1e-6; s += 0.5, j++) {
        if (r >= 4 && j % 2 === 1) continue;                                   // split fan tips: floor shows between them
        const x = Math.round(x0 + ca * r - sa * s), z = Math.round(z0 + sa * r + ca * s);
        const edge = Math.abs(s) > w - 0.5 || r === L;
        g.put(x, y, z, r < 2 ? 'alocasiaStem' : j % 4 < 2 ? 'trail_palm' : 'trail_palmDark', 'keep');   // pleated top
        if (r >= 3 && edge) g.put(x, y - 1, z, 'trail_palmUnder', 'keep');            // a thin silver lip under the rim
      }
    }
  }
}

/**
 * Ranger station on stilts: plank house (w × d) with a veranda in front (+z), a terracotta hip roof, stairs down
 * to the plaza, windows with shutters, lantern, water jars, a bench. p = [x0, groundY, z0] = back-left corner (min x,
 * min z) of the platform. Returns { floor, door, bench, veranda: [[x0, z0], [x1, z1]], stairFoot, under }.
 */
export function rangerStation(g, p, o = {}) {
  const [x0, gy, z0] = p;
  const w = o.w ?? 13, d = o.d ?? 9, ver = o.veranda ?? 3, stilt = o.stilt ?? 4, wallH = o.wallH ?? 6;
  const x1 = x0 + w - 1, zw = z0 + d - 1, z1 = zw + ver;    // walls z0..zw, veranda zw+1..z1
  const fy = gy + stilt;                                     // floor voxel row
  const groundAt = (x, z) => { for (let y = fy - 1; y > gy - 8; y--) if (g.get(x, y, z)) return y; return gy - 8; };
  // stilts: posts on a grid + cross braces
  const posts = [];
  for (let x = x0; x <= x1; x += 4) for (let z = z0; z <= z1; z += 4) posts.push([x, z]);
  for (const x of [x0, x1]) for (const z of [z0, zw, z1]) posts.push([x, z]);
  for (const [px, pz] of posts) {
    const b = groundAt(px, pz);
    g.box([px, b - 1, pz], [px, fy - 1, pz], 'beam');
    g.set(px, b + 1, pz, 'stoneLight');                    // stone footing
  }
  for (const z of [z0, zw]) g.line([x0, fy - 3, z], [x0 + 4, fy - 1, z], 'beam'), g.line([x1, fy - 3, z], [x1 - 4, fy - 1, z], 'beam');
  // floor platform + joists
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) g.set(x, fy, z, (x === x0 || x === x1 || z === z0 || z === z1) ? 'plankDark' : ((x + (z >> 1)) & 1 ? 'plank' : 'plankLight'));
  for (let z = z0; z <= z1; z += 2) g.box([x0, fy - 1, z], [x1, fy - 1, z], 'beam', { mode: 'keep' });
  // walls: vertical teak boards, darker beams at corners/top/bottom, doors + windows
  const doorX = x0 + Math.floor(w / 2) - 1;
  for (let y = fy + 1; y <= fy + wallH; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= zw; z++) {
    const edgeX = x === x0 || x === x1, edgeZ = z === z0 || z === zw;
    if (!edgeX && !edgeZ) continue;
    const corner = edgeX && edgeZ, along = edgeZ ? x : z;
    let m = corner || y === fy + 1 || y === fy + wallH ? 'beam' : along & 1 ? 'trail_teak' : 'trail_teakLight';
    if (z === zw && x >= doorX && x <= doorX + 1 && y <= fy + 4) m = 'door';
    const win = (y === fy + 3 || y === fy + 4);
    if (win && z === zw && (x === x0 + 2 || x === x0 + 3 || x === x1 - 2 || x === x1 - 3)) m = 'window';
    if (win && edgeX && !edgeZ && (z === z0 + 3 || z === z0 + 4)) m = 'window';
    if (win && z === z0 && (x === x0 + 4 || x === x0 + 5)) m = 'window';
    g.set(x, y, z, m);
  }
  g.box([x0 + 1, fy + 1, z0 + 1], [x1 - 1, fy + wallH, zw - 1], 0);   // hollow
  // shutters (green, open) beside the front windows
  for (const xs of [x0 + 1, x0 + 4, x1 - 4, x1 - 1]) for (const y of [fy + 3, fy + 4]) g.set(xs, y, zw + 1, 'templeGreen');
  // veranda railing (front + sides), gap for the stairs
  const stairX = doorX;
  for (let x = x0; x <= x1; x++) {
    if (x >= stairX - 1 && x <= stairX + 2) continue;
    g.set(x, fy + 2, z1, 'plankDark');
    if ((x - x0) % 3 === 0 || x === x1) g.set(x, fy + 1, z1, 'beam');
  }
  for (const x of [x0, x1]) for (let z = zw + 1; z <= z1; z++) { g.set(x, fy + 2, z, 'plankDark'); g.set(x, fy + 1, z, 'beam'); }
  // veranda posts holding the roof
  for (const x of [x0, x1, stairX - 2, stairX + 3]) g.box([x, fy + 1, z1], [x, fy + wallH, z1], 'beam');
  // roof: terracotta hip over house + veranda
  g.roof([x0, fy + wallH + 1, z0], [x1, fy + wallH + 1, z1], 'roofTile', { type: 'gable', axis: 'x', overhang: 2, ridge: 'roofTileDark', gable: 'trail_teak' });
  // stairs down to the plaza (+z)
  let k = 0, sy = fy, sz = z1 + 1;
  for (; k < 12; k++) {
    sz = z1 + 1 + k; sy = fy - 1 - k;
    const b = groundAt(stairX, sz);
    if (sy <= b) break;
    for (let x = stairX - 1; x <= stairX + 2; x++) g.set(x, sy, sz, x === stairX - 1 || x === stairX + 2 ? 'beam' : 'plank');
    if (k % 2 === 0) for (const x of [stairX - 1, stairX + 2]) g.box([x, b, sz], [x, sy - 1, sz], 'beam', { mode: 'keep' });
  }
  // props on the veranda: bench + water jar + potted plants + lantern + a sign board
  const by = fy + 1;
  g.box([x0 + 1, by, zw + 1], [x0 + 3, by, zw + 1], 'plankDark');
  g.set(x1 - 1, by, z1 - 1, 'thaiClay'); g.set(x1 - 1, by + 1, z1 - 1, 'thaiClay'); g.set(x1 - 2, by, z1 - 1, 'thaiClay');
  g.set(x1 - 1, by + 2, z1 - 1, 'beam');
  for (const x of [stairX - 2, stairX + 3]) { g.set(x, by, z1 - 1, 'thaiClay'); g.set(x, by + 1, z1 - 1, 'leaf'); g.set(x, by + 2, z1 - 1, 'leafLight'); }
  g.set(doorX + 3, fy + wallH, zw + 1, 'beam'); g.set(doorX + 3, fy + wallH - 1, zw + 1, 'lanternGlow');
  // name board over the door: dark plank with a pale stripe
  g.box([doorX - 2, fy + wallH - 1, zw + 1], [doorX + 1, fy + wallH - 1, zw + 1], 'plankDark');
  g.set(doorX - 1, fy + wallH - 1, zw + 1, 'trail_markWhite'); g.set(doorX, fy + wallH - 1, zw + 1, 'trail_mapGreen');
  // blue water tank on the side, a hammock between two stilts underneath
  const tx = x1 + 2, tz = z0 + 2, tb = groundAt(tx, tz);
  g.box([tx, tb + 1, tz], [tx + 1, tb + 4, tz + 1], 'trail_tank'); g.set(tx, tb + 5, tz, 'trail_tank');
  g.line([x1, tb + 4, tz + 1], [tx, tb + 4, tz], 'metalDark');
  const ha = [x0 + 4, z0 + 4], hb = [x0 + 8, z0 + 4], hy0 = groundAt(ha[0], ha[1]) + 3;
  for (let x = ha[0] + 1; x < hb[0]; x++) g.set(x, hy0 - (x > ha[0] + 1 && x < hb[0] - 1 ? 1 : 0), ha[1], 'hammock');
  return { floor: fy, door: [doorX, fy + 1, zw + 1], bench: [x0 + 1, fy + 1, zw + 1], stairX, stairFoot: [stairX, sy, sz], under: [x0 + 2, z0 + 2], z1, x1 };
}

/**
 * Arched timber footbridge along z from (x, za) to (x, zb), deck `w` wide centred on x, ends at yEnd (deck voxel
 * row at both banks), rising `arch` in the middle; log stringers, braces down to the water/bed, a trestle pier in
 * the middle, posts + handrail. Returns { deckAt(z) → y, posts: [[x, y, z]] (rail post tops: perches) }.
 */
export function footbridge(g, x, za, zb, o = {}) {
  const w = o.w ?? 3, arch = o.arch ?? 3, hw = (w - 1) >> 1;
  const ya = o.ya, yb = o.yb ?? ya;
  const n = zb - za;
  const deckAt = (z) => { const t = (z - za) / n; return Math.round(ya + (yb - ya) * t + Math.sin(Math.PI * t) * arch); };
  const water = new Set(['riverWater', 'lakeWater'].map((m) => g.mat(m)));
  const solidBelow = (xx, y, z) => { const lo = y - 24; while (y > lo && (!g.get(xx, y, z) || water.has(g.get(xx, y, z)))) y--; return y; };
  const posts = [];
  for (let z = za; z <= zb; z++) {
    const y = deckAt(z), i = z - za, end = z === za || z === zb;
    for (let dx = -hw; dx <= hw; dx++) g.set(x + dx, y, z, hash3(x + dx, y, z, 3) < 0.1 ? 'plankDark' : (i & 1 ? 'plank' : 'plankLight'));
    for (const sx of [-hw, hw]) g.set(x + sx, y - 1, z, 'beam');                 // log stringers under the deck edges
    for (const sx of [-hw - 1, hw + 1]) {
      if (i % 4 === 0 || end) { g.box([x + sx, y - 1, z], [x + sx, y + 2, z], 'beam'); posts.push([x + sx, y + 2, z]); }
      else g.set(x + sx, y + 2, z, 'bambooPole');                              // handrail
      const ny = deckAt(Math.min(zb, z + 1));
      if (ny > y && z < zb) g.set(x + sx, y + 3, z, 'bambooPole');               // keep the rail continuous up the arch
    }
  }
  // stone abutments under both ends
  for (const [z0, s] of [[za, -1], [zb, 1]]) for (let dz = 0; dz <= 1; dz++) for (let dx = -hw - 1; dx <= hw + 1; dx++) {
    const z = z0 + s * dz, y = deckAt(z0) - 1;
    for (let yy = solidBelow(x + dx, y, z) + 1; yy <= y - (dz ? 1 : 0); yy++) g.set(x + dx, yy, z, (yy + dx) & 1 ? 'limestone' : 'limestoneDark');
  }
  // trestle pier in the middle: two posts down to the bed with a cross brace
  const zm = Math.round((za + zb) / 2), ym = deckAt(zm);
  for (const sx of [-hw - 1, hw + 1]) { const b = solidBelow(x + sx, ym - 1, zm); g.box([x + sx, b + 1, zm], [x + sx, ym - 1, zm], 'beam'); }
  g.line([x - hw - 1, ym - 4, zm], [x + hw + 1, ym - 1, zm], 'beam', { mode: 'keep' });
  g.line([x + hw + 1, ym - 4, zm], [x - hw - 1, ym - 1, zm], 'beam', { mode: 'keep' });
  return { deckAt, posts };
}

/**
 * Plank boardwalk along x (x0…x1) over rows z0…z1, one voxel above the highest ground of each x slice (adjacent
 * slices differ by ≤ 1, so walkers can use it), posts down to the ground, a rope rail on the +z (front) row.
 * gy(x, z) → ground top. Returns { yAt(x) → deck y }.
 */
export function boardwalk(g, x0, x1, z0, z1, gy) {
  const ys = new Map();
  for (let x = x0; x <= x1; x++) { let m = -Infinity; for (let z = z0; z <= z1; z++) m = Math.max(m, gy(x, z)); ys.set(x, m + 1); }
  for (let pass = 0; pass < 4; pass++) for (let x = x0 + 1; x <= x1; x++) {  // no steps > 1 between slices
    const a = ys.get(x - 1), b = ys.get(x);
    if (b > a + 1) ys.set(x - 1, b - 1); else if (a > b + 1) ys.set(x, a - 1);
  }
  const yAt = (x) => ys.get(Math.max(x0, Math.min(x1, x)));
  for (let x = x0; x <= x1; x++) {
    const y = yAt(x);
    for (let z = z0; z <= z1; z++) {
      g.set(x, y, z, z === z0 || z === z1 ? 'plankDark' : ((x & 1) ? 'plank' : 'plankLight'));
      if ((x - x0) % 4 === 0 || x === x1) if (z === z0 || z === z1) for (let yy = y - 1; yy > y - 8 && !g.get(x, yy, z); yy--) g.set(x, yy, z, 'beam');
    }
    if ((x - x0) % 3 === 0 || x === x1) g.box([x, y + 1, z1], [x, y + 3, z1], 'beam');
    else g.set(x, y + 3, z1, 'fiberRope');
  }
  return { yAt };
}

/** A closed polyline [[x, z], …] restarted at index i0 and then `offset` voxels further along it (actor paths). */
export function rotateLoop(pts, i0, offset) {
  const P = [...pts.slice(i0), ...pts.slice(0, i0)], n = P.length;
  let d = offset;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], s = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= s) {
      const t = s ? d / s : 0, q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return [q, ...P.slice(i + 1), ...P.slice(0, i + 1)];
    }
    d -= s;
  }
  return P;
}

/** A small motorbike parked along x: p = standing cell of the rear wheel. */
export function motorbike(g, p, dir = '+x') {
  const [fx, fz] = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[dir];
  const S = (a, dy, b, m) => g.set(p[0] + fx * a - fz * b, p[1] + dy, p[2] + fz * a + fx * b, m);   // a = along, b = across
  for (const a of [0, 4]) { S(a, 0, 0, 'metalDark'); S(a, 1, 0, 'metalDark'); }
  S(2, 0, 0, 'metal');
  for (let a = 1; a <= 3; a++) S(a, 1, 0, 'trail_bikeRed');
  S(1, 2, 0, 'metalDark'); S(2, 2, 0, 'metalDark');
  S(4, 2, 0, 'metal'); S(4, 3, -1, 'metalDark'); S(4, 3, 1, 'metalDark'); S(4, 3, 0, 'trail_bikeRed');
  S(5, 2, 0, 'trail_lamp');
}

/** Trail marker: a short post with a red + white band. */
export function marker(g, x, y, z) {
  g.set(x, y, z, 'beam'); g.set(x, y + 1, z, 'beam'); g.set(x, y + 2, z, 'trail_markWhite'); g.set(x, y + 3, z, 'trail_markRed');
}

/** Interpretive board on two legs facing `side` ('+z' | '+x'), with a tiny picture (rows of material ids, top first). */
export function infoBoard(g, p, side, picture) {
  const [x, y, z] = p, W = picture[0].length, H = picture.length;
  const along = side === '+z' ? [1, 0] : [0, 1];
  const at = (u, yy) => [x + along[0] * u, yy, z + along[1] * u];
  for (const u of [0, W + 1]) for (let yy = y; yy < y + 3 + H; yy++) g.set(...at(u, yy), 'beam');
  for (let u = 1; u <= W; u++) for (let r = 0; r < H; r++) g.set(...at(u, y + 2 + H - 1 - r), picture[r][u - 1]);
  for (let u = 0; u <= W + 1; u++) g.set(...at(u, y + 3 + H - 1), 'plankDark');
}

/** A ranger / guide: person() in khaki with an olive cap. */
export const ranger = (g, p, side, pose = 'stand', seed = 1) => person(g, p, { side, pose, shirt: 'trail_khaki', pants: 'trail_olive', hat: 'trail_olive', seed });

export { clamp };

const PLANT = ['alocasiaStem', 'treeFernTrunk', 'treeFernTrunkLight', 'rattanStem', 'rattanStemDark', 'liana', 'lianaDark', 'heliconia',
  'heliconiaTip', 'pitcher', 'pitcherGreen', 'pitcherRim', 'pitcherInside', 'fungus', 'fungusOrange', 'bromeliad', 'mossDeep', 'bananaTrunk',
  'bananaFruit', 'bananaFlower', 'figRoot', 'figRootDark', 'orchid', 'orchidWhite'];
/**
 * Keep a walking corridor open along actor paths ([[x, z], …], closed or open): delete plant voxels (anything that
 * sways, stems, lianas, aerial roots…) from 1 to `h` above the walking surface within `r` of the line, so walkers never
 * step onto foliage (the actors' height field treats floating leaves as ground). gy(x, z) → the ground top.
 */
export function clearCorridor(g, pts, gy, o = {}) {
  const r = o.r ?? 1.3, h = o.h ?? 11, closed = o.closed ?? true;
  const P = g.palette, plant = new Set(PLANT.filter((n) => P.has(n)).map((n) => g.mat(n)));
  const isPlant = (id) => plant.has(id) || (P.defs[id]?.sway ?? 0) > 0;
  const done = new Set();
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t <= L; t += 0.5) {
      const cx = a[0] + ((b[0] - a[0]) * t) / (L || 1), cz = a[1] + ((b[1] - a[1]) * t) / (L || 1);
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        const k = x + ',' + z;
        if (done.has(k) || Math.hypot(x + 0.5 - cx, z + 0.5 - cz) > r + 0.5) continue;
        done.add(k);
        const y0 = gy(x, z);
        for (let y = y0 + 1; y <= y0 + h; y++) { const id = g.get(x, y, z); if (id && isPlant(id)) g.set(x, y, z, 0); }
      }
    }
  }
}

/**
 * Over a walkway that passes UNDER things (a hollow fig, an arch): make every column above the walking surface either
 * open (≥ `clear` air) or one solid run, by filling the small air gaps between stacked runs (lattice → crown) with
 * `m`. The actors' height field then walks under instead of stepping onto the top. y0 = the walking surface top.
 */
export function sealOverhead(g, x, z, y0, o = {}) {
  const clear = o.clear ?? 10, m = g.mat(o.m ?? 'figRootDark');
  const top = g.top(x, z);
  if (top <= y0 + clear) return;
  let y = top;
  while (y > y0 + clear) {
    let lo = y; while (g.get(x, lo - 1, z) && lo - 1 > y0) lo--;          // bottom of this run
    let below = lo - 1; while (below > y0 && !g.get(x, below, z)) below--; // top of the next run down (or the ground)
    if (below <= y0) break;                                             // open all the way down: fine
    if (lo - below - 1 < clear) for (let yy = below + 1; yy < lo; yy++) g.set(x, yy, z, m);
    y = below;
  }
}
