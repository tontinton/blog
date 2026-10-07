// The two blue British shorthairs.
//
//  · the ROUND cat (fc*) sits upright on her floor pouf by the sofa: a big soft ball of a body, an
//    enormous round head with puffy jowls wider than the skull, tiny ears set wide and low, big copper
//    eyes under half-lowered lids (flat top line → that grumpy, unimpressed stare), short thick tail
//    wrapped around her side.
//  · the SMALLER cat (kt*) sits neatly on the window seat under the big back window: slimmer, a smaller
//    narrower face, bigger ears, amber eyes, a touch darker blue; her tail hangs over the front edge of
//    the seat and sways, and every so often she turns her head to watch the leaves falling outside.
//
// Parts (world coords, rest pose):
//   fatcat: fcBody (breathes), fcHead (tilts / turns a little), fcEarL + fcEarR (twitch), fcTail (tip flicks)
//   kitten: ktBody (breathes), ktHead (turns to look out of the window), ktEarL + ktEarR (twitch),
//           ktTail (the bit hanging over the seat edge, sways)
// Children (head → ears, body → head/tail) are composed in update() so joints never open up.
// Blinks ("cat kisses") are palette colour swaps on per-row eye materials, done only on state changes.
import { VoxelGrid, hash3, THREE } from '../lib/index.js';

// ---- palette ---------------------------------------------------------------------------------------
const fur = (color, dark, amt = 0.45) => ({ color, jitter: 0.05, noise: { color: dark, scale: 0.35, amount: amt } });
const eye = (color, emissive = 0.5) => ({ color, jitter: 0, roughness: 0.2, emissive });   // eyes catch the firelight
export const MATERIALS = {
  // round cat: cool blue-grey plush, 5 values
  fcFurLL: fur('#ccdce4', '#bcccd4', 0.35),
  fcFurL: fur('#b5c8d1', '#a5b9c3'),
  fcFur: fur('#a0b5bf', '#92a7b2'),
  fcFurD: fur('#899ea9', '#7e939d'),
  fcFurDD: fur('#748892', '#6b7c85'),
  fcEarIn: { color: '#b8a4b8', jitter: 0.04 },
  fcNose: { color: '#c09aae', jitter: 0.02, roughness: 0.5 },
  fcNoseD: { color: '#98869f', jitter: 0.02, roughness: 0.5 },
  fcLid: { color: '#58617e', jitter: 0.02 },                    // closed-eye line (blinks)
  fcEyeT: eye('#d0781f', 0.3),                                  // eye, top row (under the brow)
  fcEyeB: eye('#f2a03c', 0.4),                                   // eye, lower rows (bright copper)
  fcPupT: eye('#24160e', 0),
  fcPupB: eye('#24160e', 0),
  fcHiT: eye('#ffd9a0', 0.8),                                    // catch-light
  // smaller cat: a touch darker
  ktFurLL: fur('#bfd1da', '#afc1ca', 0.35),
  ktFurL: fur('#a6bbc6', '#98acb6'),
  ktFur: fur('#92a8b3', '#869ba5'),
  ktFurD: fur('#7e929c', '#728791'),
  ktFurDD: fur('#6c7e87', '#62737b'),
  ktEarIn: { color: '#ae9cb0', jitter: 0.04 },
  ktNose: { color: '#b4909f', jitter: 0.02, roughness: 0.5 },
  ktLid: { color: '#4d5466', jitter: 0.02 },                    // closed-eye line (blinks)
  ktEyeT: eye('#d2a632', 0.2),       // amber with a hint of green-yellow (a touch less orange than the round cat's copper)
  ktEyeB: eye('#e4c04c', 0.25),
  ktPupT: eye('#22160e', 0),
  ktPupB: eye('#22160e', 0),
  ktHiT: eye('#ffe0a0', 0.8),
};

// ---- tiny SDF kit (index space: voxel i has its centre at i) ---------------------------------------
const ell = (c, r) => (x, y, z) => {
  const dx = (x - c[0]) / r[0], dy = (y - c[1]) / r[1], dz = (z - c[2]) / r[2];
  return (Math.sqrt(dx * dx + dy * dy + dz * dz) - 1) * Math.min(r[0], r[1], r[2]);
};
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const union = (k, ...fs) => (x, y, z) => { let d = Infinity; for (const f of fs) d = smin(d, f(x, y, z), k); return d; };
// capsule / round cone from a (radius ra) to b (radius rb)
const cone = (a, b, ra, rb) => (x, y, z) => {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const px = x - a[0], py = y - a[1], pz = z - a[2];
  const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz)));
  return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - (ra + (rb - ra) * t);
};
// polyline tube with linearly varying radius
const tube = (pts, r0, r1) => {
  const segs = []; let L = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); segs.push([pts[i - 1], pts[i], L, L + l]); L += l; }
  return (x, y, z) => {
    let d = Infinity;
    for (const [a, b, l0, l1] of segs) {
      const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz)));
      const r = r0 + (r1 - r0) * ((l0 + (l1 - l0) * t) / L);
      d = Math.min(d, Math.hypot(px - bx * t, py - by * t, pz - bz * t) - r);
    }
    return d;
  };
};
const dith = (x, y, z, s = 1) => (hash3(x, y, z, 77) - 0.5) * s * 0.7;   // soft, stable threshold dither

// front-most voxel of a grid in column (x, y), searching z from hi down to lo
const front = (g, x, y, lo, hi) => { for (let z = hi; z >= lo; z--) if (g.get(x, y, z)) return z; return null; };
// paint a face picture onto the front surface of a head grid: rows top→bottom starting at y0, cols from x0
function face(g, x0, y0, rows, legend, zlo, zhi, extra = {}) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const m = legend[ch]; if (!m) return;
    const x = x0 + i, y = y0 - j, z = front(g, x, y, zlo, zhi);
    if (z === null) return;
    g.set(x, y, z, m);
    if (extra[ch]) extra[ch](x, y, z);
  }));
}

// fill helper: evaluate a classifier over a box; cls(x,y,z) → [grid, material] | null
function fill(lo, hi, cls) {
  for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
    const r = cls(x, y, z); if (r) r[0].set(x, y, z, r[1]);
  }
}

// lofted superellipse solid: rows[j] = [rx, zBack, zFront] for layer y = y0 + j (relative z, centre column cx)
const loft = (cx, cz, y0, rows, p = 2.3, pHead = null, yHead = Infinity) => (x, y, z) => {
  const r = rows[y - y0]; if (!r) return false;
  const [rx, zb, zf] = r, zc = cz + (zb + zf) / 2, rz = (zf - zb) / 2;
  const q = y - y0 >= yHead ? pHead : p;
  return Math.abs((x - cx) / rx) ** q + Math.abs((z - zc) / rz) ** q <= 1;
};
// a hand-placed ear: voxels [X, Y, z0, z1, inner?] relative to (cx, b, cz) for the +x ear, mirrored for s = -1.
// Ear cells take over any head cells they cover; `inner` rows get the pink-grey inner colour on their front face.
function ear(eg, head, s, cx, b, cz, rows, mat, inner) {
  for (const [X, Y, z0, z1, inn] of rows) {
    const x = cx + s * X, y = b + Y;
    for (let z = cz + z0; z <= cz + z1; z++) { head.del(x, y, z); eg.set(x, y, z, inn && z === cz + z1 ? inner : mat); }
  }
}

// ======================================================================================================
// THE ROUND CAT
// ======================================================================================================
function fatcat(P, L) {
  const [AX, AY, AZ] = L.SPOTS.fatcat.anchor;        // 44, 5, 35
  const CX = AX, B = AY;                              // centre column, bottom layer
  const body = new VoxelGrid(P), head = new VoxelGrid(P), earL = new VoxelGrid(P), earR = new VoxelGrid(P), tail = new VoxelGrid(P);
  const NECK = 7;                                     // layers Y >= NECK are the head

  // one round lofted mass, front view: wide haunches → soft waist → jowls wider than the skull → round crown
  const solid = loft(CX, AZ, B, [
    [5.2, -4.2, 4.2],    // 0
    [6.3, -5.1, 4.5],
    [7.1, -5.6, 4.6],
    [7.2, -5.7, 4.5],
    [7.0, -5.5, 4.4],
    [6.5, -5.0, 4.4],    // 5
    [6.0, -4.3, 5.3],    // collar under the jowls
    [6.4, -3.8, 5.8],    // 7: jowls
    [6.9, -3.4, 6.2],
    [7.15, -3.1, 6.4],
    [6.9, -2.9, 6.4],    // 10
    [6.6, -2.8, 6.3],
    [6.1, -2.7, 6.0],
    [5.5, -2.5, 5.5],
    [4.6, -2.1, 4.6],
    [3.0, -1.2, 3.0],    // 15: crown
  ], 2.05, 2.5, NECK);
  const muzzle = ell([CX, B + 8.9, AZ + 6.7], [2.3, 1.4, 0.95]);
  const extras = union(0.6,
    cone([CX - 2, B + 6, AZ + 4.0], [CX - 2, B + 1, AZ + 4.7], 1.35, 1.3),   // front legs
    cone([CX + 2, B + 6, AZ + 4.0], [CX + 2, B + 1, AZ + 4.7], 1.35, 1.3),
    ell([CX - 2, B + 0.5, AZ + 5.3], [1.45, 1.0, 1.5]),                       // front paws
    ell([CX + 2, B + 0.5, AZ + 5.3], [1.45, 1.0, 1.5]),
    ell([CX - 4.7, B + 0.4, AZ + 3.2], [1.3, 0.9, 1.6]),                      // hind foot (the other is under the tail)
  );
  // tail: from her rear around her left (+x) side to the front
  const fTail = tube([[CX + 2.6, B + 1.0, AZ - 5.8], [CX + 6.0, B + 1.0, AZ - 4.6], [CX + 7.8, B + 1.1, AZ - 1.4], [CX + 7.7, B + 1.0, AZ + 2.0], [CX + 6.2, B + 0.9, AZ + 4.8], [CX + 4.2, B + 0.9, AZ + 6.2]], 1.6, 1.15);
  const TIP = [CX + 7.7, B + 1.0, AZ + 2.0];                 // tip joint (flicks)

  fill([CX - 10, B, AZ - 9], [CX + 10, B + 16, AZ + 9], (x, y, z) => {
    const X = x - CX, Y = y - B, Z = z - AZ, d = dith(x, y, z, 0.8);
    const inS = solid(x, y, z), inM = muzzle(x, y, z) <= 0;
    if (Y >= NECK && (inS || inM)) {
      let m = 'fcFur';
      if (Z > 3.6 + d && Y < 11 + d) m = 'fcFurL';                          // jowls
      if (inM || (Z > 5 && Y <= 10 && Math.abs(X) < 3.2 + d)) m = 'fcFurLL';  // whisker pads / chin
      if (Z < -0.8 + d) m = 'fcFurD';                                          // back of the head
      return [head, m];
    }
    if (fTail(x, y, z) <= 0 && Y >= 0) {
      const tipSide = Z > TIP[2] - AZ + 0.2;
      return [tipSide ? tail : body, hash3(x, y, z, 5) < 0.75 ? 'fcFurDD' : 'fcFurD'];
    }
    const inE = extras(x, y, z) <= 0;
    if (Y < NECK && (inS || inE || inM)) {
      let m = 'fcFur';
      if (Z > 2.5 + d && Y > 2 + d) m = 'fcFurL';                             // chest / bib
      if (inE && Z > 3.5 && Y <= 1) m = 'fcFurL';                             // paws
      if (Z < -4 + d && Y > 2 + d) m = 'fcFurD';                               // back
      return [body, m];
    }
    return null;
  });
  // toe grooves on the front paws
  for (const s of [-1, 1]) { const x = CX + s * 2, z = front(body, x, B, AZ, AZ + 9); if (z !== null) body.set(x, B, z, 'fcFur'); }

  // --- ears: tiny nubs, wide and low
  for (const [s, eg] of [[-1, earL], [1, earR]]) {
    ear(eg, head, s, CX, B, AZ, [
      [5, 14, 0, 2], [6, 14, 0, 1], [5, 15, 0, 2, 1], [4, 15, 0, 2, 1], [6, 15, 0, 1], [5, 16, 0, 1],
    ], 'fcFurD', 'fcEarIn');
  }

  // --- face (cols X = -6..6, rows from Y = 12 down): brow/lid, eyes with catch-light + pupil, nose
  face(head, CX - 6, B + 12, [
    '..LLL...LLL..',
    '..HPT...HPT..',
    '..BpB...BpB..',
    '...B.nNn.B...',
    '......N......',
  ], { L: 'fcFurD', T: 'fcEyeT', B: 'fcEyeB', P: 'fcPupT', p: 'fcPupB', H: 'fcHiT', N: 'fcNose', n: 'fcNoseD' }, AZ - 2, AZ + 9,
  // heavy brow: the lid row overhangs the eyes by a voxel → a hooded, unimpressed stare
  { L: (x, y, z) => head.set(x, y, z + 1, 'fcFur') });

  const pivots = {
    body: [CX + 0.5, B, AZ + 0.5],
    head: [CX + 0.5, B + NECK, AZ + 1.5],
    earL: [CX - 5 + 0.5, B + 14, AZ + 1.5],
    earR: [CX + 5 + 0.5, B + 14, AZ + 1.5],
    tail: [TIP[0] + 0.5, TIP[1] + 0.5, TIP[2] + 0.5],
  };
  return {
    parts: [
      { name: 'fcBody', grid: body, pivot: pivots.body },
      { name: 'fcHead', grid: head, pivot: pivots.head },
      { name: 'fcEarL', grid: earL, pivot: pivots.earL },
      { name: 'fcEarR', grid: earR, pivot: pivots.earR },
      { name: 'fcTail', grid: tail, pivot: pivots.tail },
    ],
    pivots,
  };
}

// ======================================================================================================
// THE SMALLER CAT
// ======================================================================================================
function kitten(P, L) {
  const [AX, AY, AZ] = L.SPOTS.kitten.anchor;          // 56, 10, 5
  const CX = AX, B = AY, ZC = AZ;
  const body = new VoxelGrid(P), head = new VoxelGrid(P), earL = new VoxelGrid(P), earR = new VoxelGrid(P), tail = new VoxelGrid(P);
  const NECK = 7;                                       // layers Y >= NECK are the head
  const NZ = ZC + 1;                                    // neck axis z (the head turns around x = CX, z = NZ)

  const solid = loft(CX, ZC, B, [
    [3.2, -3.3, 2.6],    // 0
    [3.8, -3.8, 2.8],
    [4.0, -4.0, 2.8],
    [3.8, -3.8, 2.7],
    [3.3, -3.2, 2.8],
    [2.9, -2.5, 3.0],    // 5
    [2.7, -1.8, 3.4],    // 6: neck
    [3.1, -1.3, 4.0],    // 7: chin
    [3.9, -1.6, 4.5],
    [4.7, -1.8, 4.8],
    [5.2, -1.9, 4.8],    // 10
    [5.2, -1.9, 4.6],
    [4.6, -1.8, 4.2],
    [3.6, -1.4, 3.6],
    [2.3, -0.7, 2.4],    // 14: crown
  ], 2.2, 2.6, NECK);
  const muzzle = ell([CX, B + 8.3, ZC + 4.7], [1.6, 1.1, 0.8]);
  const extras = union(0.5,
    cone([CX - 1.1, B + 5.5, ZC + 2.4], [CX - 1.1, B + 0.5, ZC + 3.0], 1.05, 1.0),   // front legs, close together
    cone([CX + 1.1, B + 5.5, ZC + 2.4], [CX + 1.1, B + 0.5, ZC + 3.0], 1.05, 1.0),
    ell([CX - 1.1, B + 0.4, ZC + 3.6], [1.0, 0.8, 1.2]),              // paws
    ell([CX + 1.1, B + 0.4, ZC + 3.6], [1.0, 0.8, 1.2]),
    ell([CX - 3.2, B + 0.3, ZC + 1.6], [0.9, 0.7, 1.4]),              // hind foot (other one under the tail)
  );
  // tail along the cushion: from her rear round her left side to the front edge of the seat
  const fTailFlat = tube([[CX + 1.5, B + 0.6, ZC - 4.0], [CX + 4.0, B + 0.5, ZC - 2.0], [CX + 4.8, B + 0.5, ZC + 1.6], [CX + 5, B + 0.5, ZC + 5.0]], 1.1, 0.95);
  // hanging part: drops over the front edge (seat cells end at z = 10)
  // (the seat has a lip at y = 7, z = 11 and knobs at z = 11, so below the lip the tail hangs at z = 12)
  const HX = CX + 5, HZ = ZC + 6;
  const fTailHang = tube([[HX, B + 0.4, HZ - 0.6], [HX, B - 0.9, HZ + 0.1], [HX, B - 2.3, HZ + 1], [HX + 0.2, B - 4.6, HZ + 1], [HX - 0.3, B - 6.0, HZ + 0.8]], 0.95, 0.8);
  const inNeck = (x, y, z) => y >= B + 5 && (x - CX) ** 2 + (z - NZ) ** 2 <= 2.2 ** 2;

  fill([CX - 7, B - 8, ZC - 6], [CX + 7, B + 16, ZC + 7], (x, y, z) => {
    const X = x - CX, Y = y - B, Z = z - ZC, d = dith(x, y, z, 0.8);
    const inS = solid(x, y, z), inM = muzzle(x, y, z) <= 0;
    if ((Y >= NECK && (inS || inM)) || (inS && inNeck(x, y, z))) {
      let m = 'ktFur';
      if (Z > 2.4 + d && Y < 9.5 + d) m = 'ktFurL';
      if (inM || (Z > 3.6 && Y <= 8 && Math.abs(X) < 2 + d)) m = 'ktFurLL';
      if (Z < -0.6 + d) m = 'ktFurD';
      if (Y < NECK) m = Z > 1.5 ? 'ktFurL' : 'ktFur';
      return [head, m];
    }
    if (fTailHang(x, y, z) <= 0 && z >= HZ) return [tail, hash3(x, y, z, 6) < 0.5 ? 'ktFurDD' : 'ktFurD'];
    if (fTailFlat(x, y, z) <= 0 && Y >= 0 && z < HZ) return [body, hash3(x, y, z, 6) < 0.5 ? 'ktFurDD' : 'ktFurD'];
    const inE = extras(x, y, z) <= 0;
    if (Y >= 0 && Y < NECK && (inS || inE)) {
      let m = 'ktFur';
      if (Z > 1.6 + d && Y > 3 + d) m = 'ktFurL';
      if (inE && Z > 2.2 && Y <= 1) m = 'ktFurL';
      if (Z < -1.5 + d && Y > 3 + d) m = 'ktFurD';
      if (Z < -3 + d) m = 'ktFurD';
      return [body, m];
    }
    return null;
  });
  // ears: proper triangles, bigger and more upright than hers
  for (const [s, eg] of [[-1, earL], [1, earR]]) {
    ear(eg, head, s, CX, B, ZC, [
      [2, 13, 0, 2, 1], [3, 13, 0, 2, 1], [4, 13, 0, 1], [2, 14, 0, 1], [3, 14, 0, 2, 1], [4, 14, 0, 1], [3, 15, 0, 1, 1], [4, 15, 0, 1], [4, 16, 0, 0],
    ], 'ktFurD', 'ktEarIn');
  }
  face(head, CX - 5, B + 11, [
    '.HPT...HPT.',
    '.BpB...BpB.',
    '.....N.....',
  ], { T: 'ktEyeT', B: 'ktEyeB', P: 'ktPupT', p: 'ktPupB', H: 'ktHiT', N: 'ktNose' }, ZC - 3, ZC + 8);

  const pivots = {
    body: [CX + 0.5, B, ZC + 0.5],
    head: [CX + 0.5, B + NECK, NZ + 0.5],
    earL: [CX - 3 + 0.5, B + 13, ZC + 1],
    earR: [CX + 3 + 0.5, B + 13, ZC + 1],
    tail: [HX + 0.5, B + 0.5, HZ],
  };
  return {
    parts: [
      { name: 'ktBody', grid: body, pivot: pivots.body },
      { name: 'ktHead', grid: head, pivot: pivots.head },
      { name: 'ktEarL', grid: earL, pivot: pivots.earL },
      { name: 'ktEarR', grid: earR, pivot: pivots.earR },
      { name: 'ktTail', grid: tail, pivot: pivots.tail },
    ],
    pivots,
  };
}

// ======================================================================================================
// animation
// ======================================================================================================
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// 0 → 1 → 0 envelope inside a cycle: rise over [a, b], hold, fall over [c, d]
const env = (u, a, b, c, d) => smooth(a, b, u) * (1 - smooth(c, d, u));
const mod = (t, p) => ((t % p) + p) % p;

// blink level: 0 open, 1 half closed, 2 closed — a slow "cat kiss"
function blinkLevel(t, period, offset) {
  const u = mod(t + offset, period);
  if (u < 0.25) return 1; if (u < 0.85) return 2; if (u < 1.15) return 1;
  // a second, quicker blink sometimes
  const v = mod(t + offset * 1.7 + 5, period * 2.3);
  if (v > 3 && v < 3.12) return 1; if (v >= 3.12 && v < 3.3) return 2; if (v >= 3.3 && v < 3.42) return 1;
  return 0;
}

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _s = new THREE.Matrix4(), _t = new THREE.Matrix4(), _ti = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
// world matrix of a joint: parent * T(p) * R * S * T(-p)
function joint(parent, p, rot = [0, 0, 0], scl = [1, 1, 1], order = 'YXZ') {
  _e.set(rot[0], rot[1], rot[2], order); _q.setFromEuler(_e);
  _t.makeTranslation(p[0], p[1], p[2]); _ti.makeTranslation(-p[0], -p[1], -p[2]);
  _r.makeRotationFromQuaternion(_q); _s.makeScale(scl[0], scl[1], scl[2]);
  const m = new THREE.Matrix4().multiplyMatrices(_t, _r).multiply(_s).multiply(_ti);
  return parent ? new THREE.Matrix4().multiplyMatrices(parent, m) : m;
}
function apply(grp, M, pivot) {
  if (!grp) return;
  _m.multiplyMatrices(M, _t.makeTranslation(pivot[0], pivot[1], pivot[2]));
  _m.decompose(grp.position, grp.quaternion, grp.scale);
}

export function build(g, P, { L, solo }) {
  const want = (k) => !solo || solo === 'cats' || solo === k;
  const cats = [];
  if (want('fatcat')) cats.push(['fc', fatcat(P, L)]);
  if (want('kitten')) cats.push(['kt', kitten(P, L)]);

  const furCol = { fc: MATERIALS.fcFur.color, kt: MATERIALS.ktFur.color };
  const lidCol = { fc: MATERIALS.fcLid.color, kt: MATERIALS.ktLid.color };
  const lastBlink = {};
  const setBlink = (pre, lvl) => {
    if (lastBlink[pre] === lvl) return;
    lastBlink[pre] = lvl;
    const lid = (k, col) => P.update(pre + k, col ? { color: col, emissive: 0 } : { color: MATERIALS[pre + k].color, emissive: MATERIALS[pre + k].emissive });
    for (const k of ['EyeT', 'PupT', 'HiT']) lid(k, lvl >= 1 ? furCol[pre] : null);
    for (const k of ['EyeB', 'PupB']) lid(k, lvl >= 2 ? lidCol[pre] : null);
    P.texture();   // refresh the material table now (the stage only re-reads it before the next frame's updaters)
  };

  const parts = cats.flatMap(([, c]) => c.parts);
  const piv = Object.fromEntries(cats.map(([pre, c]) => [pre, c.pivots]));

  // a soft bounce of warm room light on the smaller cat's face (her window seat is otherwise backlit)
  const lights = piv.kt ? [{ type: 'point', position: [56.5, 22, 16], color: '#ffd8b0', intensity: 10, distance: 18, decay: 1.4 }] : [];

  return {
    parts,
    lights,
    update(t, groups) {
      if (piv.fc) {
        const p = piv.fc;
        const br = Math.sin(t * 2 * Math.PI / 3.6);
        const Mb = joint(null, p.body, [0, 0, 0], [1 + 0.014 * br, 1 + 0.01 * br, 1 + 0.014 * br]);
        // head rests looking at the viewer (like the photo); glances toward the fire, later a slow skeptical tilt
        const u = mod(t, 17);
        const toFire = env(u, 4, 5.4, 8.5, 9.9);
        const glance = 0.22 - toFire * 0.5 + 0.03 * Math.sin(t * 0.3);
        const tilt = Math.sin(t * 0.37) * 0.04 - toFire * 0.05 + env(u, 12, 13.2, 15, 16.3) * 0.12;
        const nod = Math.sin(t * 0.23 + 1) * 0.03;
        const Mh = joint(Mb, p.head, [nod, glance, tilt]);
        apply(groups.fcBody, Mb, p.body);
        apply(groups.fcHead, Mh, p.head);
        const tw = (ph) => { const v = mod(t + ph, 7.3); return v < 0.5 ? Math.sin(v / 0.5 * Math.PI) * (1 - v) : 0; };
        apply(groups.fcEarL, joint(Mh, p.earL, [0, 0, 0.5 * tw(2.1)]), p.earL);
        apply(groups.fcEarR, joint(Mh, p.earR, [0, 0, -0.5 * tw(5.6)]), p.earR);
        // tail tip: lazy sweep + a double flick now and then
        const fu = mod(t, 6.1);
        const flick = (fu < 1.2 ? Math.sin(fu / 1.2 * Math.PI * 2) ** 2 * (1 - fu / 1.2 * 0.4) : 0);
        apply(groups.fcTail, joint(Mb, p.tail, [-0.35 * flick, 0.12 * Math.sin(t * 0.9), -0.25 * flick], [1, 1, 1], 'XYZ'), p.tail);
        setBlink('fc', blinkLevel(t, 6.5, 2.0));
      }
      if (piv.kt) {
        const p = piv.kt;
        const br = Math.sin(t * 2 * Math.PI / 3.1 + 1);
        const Mb = joint(null, p.body, [0, 0, 0], [1 + 0.012 * br, 1 + 0.008 * br, 1 + 0.012 * br]);
        // head: looks ahead, then turns over her left shoulder to watch the leaves outside, follows one down
        const u = mod(t, 15);
        const look = env(u, 5, 6.2, 11, 12.2);
        const yaw = 0.12 * (1 - look) + look * (1.9 + 0.12 * Math.sin((u - 6) * 1.3));
        const pitch = look * (-0.3 + 0.22 * smooth(6.5, 11, u)) + (1 - look) * (0.06 + 0.03 * Math.sin(t * 0.5));
        const roll = look * 0.08 + (1 - look) * Math.sin(t * 0.41) * 0.06;
        const Mh = joint(Mb, p.head, [pitch, yaw, roll]);
        apply(groups.ktBody, Mb, p.body);
        apply(groups.ktHead, Mh, p.head);
        const tw = (ph, per) => { const v = mod(t + ph, per); return v < 0.45 ? Math.sin(v / 0.45 * Math.PI) : 0; };
        apply(groups.ktEarL, joint(Mh, p.earL, [-0.2 * tw(1.3, 5.9), 0, 0.35 * tw(1.3, 5.9)]), p.earL);
        apply(groups.ktEarR, joint(Mh, p.earR, [-0.2 * tw(3.7, 8.3), 0, -0.35 * tw(3.7, 8.3)]), p.earR);
        // hanging tail: slow pendulum sway with a curl at the end
        const sw = 0.2 * Math.sin(t * 1.25) + 0.06 * Math.sin(t * 2.9 + 0.5);
        apply(groups.ktTail, joint(Mb, p.tail, [-0.04 * (0.5 + 0.5 * Math.sin(t * 0.8)), 0, sw], [1, 1, 1], 'XYZ'), p.tail);
        setBlink('kt', blinkLevel(t, 5.3, 2.6));
      }
    },
  };
}
