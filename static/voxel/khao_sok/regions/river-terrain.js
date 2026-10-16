// river region — terrain helpers: a column model of the ground drawn by base.js, plus edit tools (re-top a
// column, turn it into river, grade a trail) so the region can reshape its interior (deep bathing pool, gravel
// beaches, elephant trails) while leaving the seams at the box edges exactly as base.js drew them.
import { columnAt, RIVER } from '../layout.js';
import { clamp, smoothstep } from '../../lib/index.js';

/** Column model over the box: kind (0 land, 1 river), top (land top / river bed top), wat (water top or -99). */
export function columns(g, box) {
  const [[x0, , z0], [x1, , z1]] = box;
  const W = x1 - x0 + 1, D = z1 - z0 + 1;
  const kind = new Uint8Array(W * D), top = new Int16Array(W * D), wat = new Int16Array(W * D).fill(-99);
  const I = (x, z) => (x - x0) + (z - z0) * W;
  const inside = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const c = columnAt(x, z), i = I(x, z);
    if (c.kind === 'land') top[i] = c.top;
    else { kind[i] = 1; top[i] = c.bed; wat[i] = c.water; }
  }
  const C = {
    g, x0, z0, x1, z1, W, D, kind, top, wat, I, inside,
    isRiver: (x, z) => inside(x, z) && kind[I(x, z)] === 1,
    topAt: (x, z) => (inside(x, z) ? top[I(x, z)] : null),
    /** feet level for something standing at (x, z): land top + 1, or the river bed + 1 */
    feet: (x, z) => top[I(Math.round(x), Math.round(z))] + 1,
    /** surface: land top, or water top */
    surf: (x, z) => { const i = I(x, z); return kind[i] ? wat[i] : top[i]; },
    /**
     * Rebuild column (x, z): new top `t` (material `mat`), optional water up to `water` (the column becomes river),
     * `sub` fills raised ground. Clears whatever was above (only use before decorating).
     */
    set(x, z, t, mat, water = null, sub = 'soil') {
      if (!inside(x, z)) return;
      const i = I(x, z), ot = top[i], ow = kind[i] ? wat[i] : -99;
      const hi = Math.max(ot, ow, t, water ?? -99);
      for (let y = Math.min(ot, t) + 1; y <= hi; y++) g.set(x, y, z, 0);
      for (let y = ot + 1; y < t; y++) g.set(x, y, z, sub);
      g.set(x, t, z, mat);
      if (water != null) for (let y = t + 1; y <= water; y++) g.set(x, y, z, 'riverWater');
      top[i] = t; kind[i] = water != null && water > t ? 1 : 0; wat[i] = kind[i] ? water : -99;
    },
    /** repaint the top voxel */
    paint(x, z, mat) { if (inside(x, z)) g.set(x, top[I(x, z)], z, mat); },
  };
  return C;
}

/** Nearest point on a polyline [[x, z], …]: { d, s (arc length), i (segment), t, px, pz, side (+1 left of travel / −1) }. */
export function nearest(pts, x, z) {
  let best = null, s0 = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (L * L));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { d, s: s0 + t * L, i, t, px, pz, side: Math.sign(dx * (z - az) - dz * (x - ax)) || 1 };
    s0 += L;
  }
  best.len = s0;
  return best;
}
export function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
/** point at arc length s on a 2D polyline (clamped; extrapolates past the ends along the end segments) */
export function pointAt(pts, s) {
  if (s < 0) { const [a, b] = pts, L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L]; }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= L || i === pts.length - 2) { const t = s / L; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    s -= L;
  }
  return pts[pts.length - 1];
}

/** Which side of the river a column is on: −1 west (left bank looking downstream… i.e. −x side), +1 east. */
export function riverSide(x, z) {
  const n = nearest(RIVER, x, z);
  // RIVER runs north → south (+z) here: points with x greater than the centre line are east
  const a = RIVER[n.i], b = RIVER[n.i + 1];
  const cx = a[0] + (b[0] - a[0]) * n.t;
  return x >= cx ? 1 : -1;
}

/**
 * Grade a trail along pts [[x, z], …]: the centre follows profile(s) → top y; the cut/fill blends into the natural
 * ground over `blend` cells beyond the half width `hw`. Land columns only (stops at water). mat(x, z, d, s) → top
 * material inside the trail. Returns the centre-line profile function.
 */
export function gradeTrail(C, pts, profile, { hw = 4, blend = 3, mat, edgeMat = null } = {}) {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]), m = hw + blend + 1;
  const bx0 = Math.floor(Math.min(...xs) - m), bx1 = Math.ceil(Math.max(...xs) + m);
  const bz0 = Math.floor(Math.min(...zs) - m), bz1 = Math.ceil(Math.max(...zs) + m);
  for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) {
    if (!C.inside(x, z) || C.isRiver(x, z)) continue;
    const n = nearest(pts, x, z);
    if (n.d > hw + blend) continue;
    // past the polyline ends, round the trail off
    const k = 1 - smoothstep(hw, hw + blend, n.d);
    const t0 = C.topAt(x, z), ht = profile(n.s);
    const nt = Math.round(t0 * (1 - k) + ht * k);
    const inTrail = n.d <= hw;
    const mm = inTrail ? mat(x, z, n.d, n.s) : nt !== t0 ? (edgeMat ?? 'bank') : null;
    if (nt !== t0 || mm) C.set(x, z, nt, mm ?? (C.g.get(x, t0, z) || 'floor'));
  }
}
