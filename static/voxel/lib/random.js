// Seeded randomness + noise. Everything here is deterministic: same seed → same art.
//
//   const R = rng(42);  R() → [0,1)   R.range(2, 5)  R.int(0, 9)  R.pick(arr)  R.chance(0.3)
//   hash3(x, y, z, seed) → [0,1)      stable per-cell random (great for "is there a flower here?")
//   const N = noise(7);  N.simplex2(x, y) / N.simplex3(x, y, z) → [-1,1]
//   N.fbm2(x, y, { octaves: 4 }) → ~[-1,1]   N.ridged2 → [0,1]   N.worley3(x, y, z) → { f1, f2, id }

// ---- hashing -------------------------------------------------------------------------------

/** 32-bit integer mix (lowbias32). */
export function hashInt(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}
/** Hash of integer coords → [0,1). */
export function hash3(x, y, z, seed = 0) {
  let h = hashInt((x | 0) * 0x27d4eb2d ^ hashInt((y | 0) * 0x165667b1 ^ hashInt((z | 0) * 0x9e3779b1 ^ (seed | 0))));
  return h / 4294967296;
}
export const hash2 = (x, y, seed = 0) => hash3(x, y, 0x5bd1e995, seed);
export const hash1 = (x, seed = 0) => hash3(x, 0x1b873593, 0x68e31da4, seed);
/** Hash a string to a 32-bit seed. */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return hashInt(h);
}

// ---- RNG ----------------------------------------------------------------------------------

/** Seeded RNG (sfc32). Callable: R() → [0,1). `seed` may be a number or string. */
export function rng(seed = 1) {
  if (typeof seed === 'string') seed = hashString(seed);
  let a = hashInt(seed ^ 0x9e3779b9), b = hashInt(a ^ 0x243f6a88), c = hashInt(b ^ 0xb7e15162), d = hashInt(c ^ 1);
  const R = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) R();
  /** float in [a, b) */
  R.range = (lo, hi) => lo + (hi - lo) * R();
  /** integer in [lo, hi] (inclusive) */
  R.int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));
  R.pick = (arr) => arr[Math.floor(R() * arr.length)];
  R.chance = (p) => R() < p;
  R.sign = () => (R() < 0.5 ? -1 : 1);
  /** approx normal distribution (mean 0, sd 1) */
  R.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = R();
    while (v === 0) v = R();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  /** pick from [[item, weight], ...] */
  R.weighted = (pairs) => {
    let total = 0;
    for (const p of pairs) total += p[1];
    let r = R() * total;
    for (const p of pairs) if ((r -= p[1]) <= 0) return p[0];
    return pairs[pairs.length - 1][0];
  };
  R.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  /** random point in unit disc → [x, y] */
  R.disc = () => {
    const r = Math.sqrt(R()), t = R() * Math.PI * 2;
    return [Math.cos(t) * r, Math.sin(t) * r];
  };
  /** random unit vector → [x, y, z] */
  R.dir = () => {
    const z = R() * 2 - 1, t = R() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return [Math.cos(t) * r, z, Math.sin(t) * r];
  };
  /** independent child stream */
  R.fork = (salt = 0) => rng(hashInt(Math.floor(R() * 4294967296) ^ hashString(String(salt))));
  return R;
}

// ---- noise ----------------------------------------------------------------------------------

const G3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3, G3c = 1 / 6;
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

/** Seeded noise bundle. All functions are pure given the seed. */
export function noise(seed = 0) {
  const R = rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  R.shuffle(p);
  const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }

  function simplex2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, tt;
    if ((tt = 0.5 - x0 * x0 - y0 * y0) > 0) { const g = G3[pm12[ii + perm[jj]]]; tt *= tt; n += tt * tt * (g[0] * x0 + g[1] * y0); }
    if ((tt = 0.5 - x1 * x1 - y1 * y1) > 0) { const g = G3[pm12[ii + i1 + perm[jj + j1]]]; tt *= tt; n += tt * tt * (g[0] * x1 + g[1] * y1); }
    if ((tt = 0.5 - x2 * x2 - y2 * y2) > 0) { const g = G3[pm12[ii + 1 + perm[jj + 1]]]; tt *= tt; n += tt * tt * (g[0] * x2 + g[1] * y2); }
    return 70 * n;
  }

  function simplex3(xin, yin, zin) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3c;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3c, y1 = y0 - j1 + G3c, z1 = z0 - k1 + G3c;
    const x2 = x0 - i2 + 2 * G3c, y2 = y0 - j2 + 2 * G3c, z2 = z0 - k2 + 2 * G3c;
    const x3 = x0 - 1 + 3 * G3c, y3 = y0 - 1 + 3 * G3c, z3 = z0 - 1 + 3 * G3c;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0, tt;
    if ((tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0) > 0) { const g = G3[pm12[ii + perm[jj + perm[kk]]]]; tt *= tt; n += tt * tt * (g[0] * x0 + g[1] * y0 + g[2] * z0); }
    if ((tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1) > 0) { const g = G3[pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]]; tt *= tt; n += tt * tt * (g[0] * x1 + g[1] * y1 + g[2] * z1); }
    if ((tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2) > 0) { const g = G3[pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]]; tt *= tt; n += tt * tt * (g[0] * x2 + g[1] * y2 + g[2] * z2); }
    if ((tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3) > 0) { const g = G3[pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]]; tt *= tt; n += tt * tt * (g[0] * x3 + g[1] * y3 + g[2] * z3); }
    return 32 * n;
  }

  /** smooth value noise in [0,1] */
  function value3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
    const h = (a, b, c) => hash3(a, b, c, seed);
    return lerp(
      lerp(lerp(h(xi, yi, zi), h(xi + 1, yi, zi), xf), lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
      lerp(lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf),
      zf,
    );
  }
  const value2 = (x, y) => value3(x, y, 0.5);

  function fbm2(x, y, o) {
    const oct = o?.octaves ?? 4, lac = o?.lacunarity ?? 2, gain = o?.gain ?? 0.5;
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * simplex2(x * freq + i * 17.3, y * freq - i * 9.1);
      norm += amp; amp *= gain; freq *= lac;
    }
    return sum / norm;
  }
  function fbm3(x, y, z, o) {
    const oct = o?.octaves ?? 4, lac = o?.lacunarity ?? 2, gain = o?.gain ?? 0.5;
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * simplex3(x * freq + i * 17.3, y * freq - i * 9.1, z * freq + i * 5.7);
      norm += amp; amp *= gain; freq *= lac;
    }
    return sum / norm;
  }
  /** ridged multifractal in [0,1] (sharp crests: mountains, cracks) */
  const ridged2 = (x, y, o = {}) => {
    const oct = o.octaves ?? 4; let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(simplex2(x * freq + i * 31.7, y * freq)); sum += n * n * amp; norm += amp; amp *= 0.5; freq *= 2; }
    return sum / norm;
  };
  /** cellular noise: f1/f2 = nearest/second distances, id = stable [0,1) per cell. */
  function worley3(x, y, z = 0, jitter = 0.9) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let f1 = 1e9, f2 = 1e9, id = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx, cy = yi + dy, cz = zi + dz;
      const px = cx + 0.5 + (hash3(cx, cy, cz, seed + 1) - 0.5) * jitter;
      const py = cy + 0.5 + (hash3(cx, cy, cz, seed + 2) - 0.5) * jitter;
      const pz = cz + 0.5 + (hash3(cx, cy, cz, seed + 3) - 0.5) * jitter;
      const d = Math.hypot(px - x, py - y, pz - z);
      if (d < f1) { f2 = f1; f1 = d; id = hash3(cx, cy, cz, seed + 4); } else if (d < f2) f2 = d;
    }
    return { f1, f2, id };
  }
  const worley2 = (x, y, jitter) => worley3(x, y, 0, jitter);
  /** domain-warped fbm: organic, swirly shapes */
  const warp2 = (x, y, amount = 1, o) => fbm2(x + amount * fbm2(x + 5.2, y + 1.3, o), y + amount * fbm2(x - 3.7, y + 8.1, o), o);

  return { simplex2, simplex3, value2, value3, fbm2, fbm3, ridged2, worley2, worley3, warp2, seed };
}

// ---- small math helpers used across the lib ---------------------------------------------------

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const mix = lerp;
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const remap = (v, a0, a1, b0, b1) => b0 + ((v - a0) / (a1 - a0)) * (b1 - b0);
