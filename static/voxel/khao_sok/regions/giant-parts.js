// Helpers for the giant region (regions/giant.js): bark, colossal buttresses, a local-frame sculpting helper,
// the sealed hornbill nest, the climbing sun bear, the wild bees' comb, a ring platform around a trunk.
import { hash3, noise, clamp } from '../../lib/index.js';
import { groundY } from '../layout.js';

export const TAU = Math.PI * 2;

/** Vertical streaky pale bark (dipterocarp look) + moss at the foot below `mossY`. → (x, y, z) => id */
export function paleBark(g, mossY, seed = 5) {
  const N = noise(seed);
  const [dk, md, lt, moss, mossL] = ['barkPaleDark', 'barkPale', 'barkPaleLight', 'jungleBarkMoss', 'giant_mossBright'].map((m) => g.mat(m));
  return (x, y, z) => {
    if (y <= mossY + Math.floor(hash3(x, 0, z, 3) * 4.5) && N.simplex3(x * 0.3, y * 0.3, z * 0.3) > -0.15) return hash3(x, y, z, 4) < 0.25 ? mossL : moss;
    const seg = Math.floor((y + hash3(x, 0, z, 77) * 37) / 7);
    if (hash3(x, seg, z, 78) < 0.08) return dk;
    if (N.simplex3(x * 0.4, y * 0.12, z * 0.4) > 0.42) return lt;
    return md;
  };
}

/** Find the trunk surface: march from (cx, cz) along (dx, dz) at height y until the cell is empty → distance. */
export function surfaceAt(g, cx, y, cz, dx, dz, max = 20) {
  for (let r = 0; r <= max; r += 0.25) if (!g.get(Math.round(cx + dx * r), y, Math.round(cz + dz * r))) return r;
  return max;
}

/** Centroid of the given material(s) in the horizontal slice y around (cx, cz) (radius rad) → [x, z] (trunk centre). */
export function trunkCentre(g, cx, y, cz, rad, mats) {
  const ids = new Set(mats.map((m) => g.mat(m)));
  let sx = 0, sz = 0, n = 0;
  for (let z = Math.floor(cz - rad); z <= Math.ceil(cz + rad); z++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
    if (ids.has(g.get(x, y, z))) { sx += x; sz += z; n++; }
  }
  return n ? [sx / n, sz / n] : [cx, cz];
}

/**
 * Colossal plank buttresses + snaking surface roots around a trunk base. base = [x, y (standing), z].
 * o: r0 (trunk radius), n, len [min, max], height [min, max], bark (fn or id), seed, angles (explicit), skip (angle → bool)
 */
export function buttresses(g, base, o = {}) {
  const [bx, by, bz] = base;
  const S = (k) => hash3(k, 11, 3, o.seed ?? 1);
  const n = o.n ?? 7, r0 = o.r0 ?? 4;
  const [l0, l1] = o.len ?? [12, 17], [h0, h1] = o.height ?? [14, 20];
  const bark = o.bark;
  const a0 = S(0) * TAU;
  const fins = [];
  for (let i = 0; i < n; i++) {
    const a = o.angles ? o.angles[i] : a0 + (i / n) * TAU + (S(i + 1) - 0.5) * 0.5;
    const L = l0 + (l1 - l0) * S(i + 20), H = h0 + (h1 - h0) * S(i + 40), curl = (S(i + 60) - 0.5) * 1.1, ph = S(i + 80) * 6;
    const thick = H > (h0 + h1) / 2 ? 0.6 : 0.45;               // fraction of the fin that's 2 voxels thick
    let px = null, pz = null;
    const cells = [];
    const lit = g.mat('barkPaleLight');
    const col = (x, z, top) => {
      const gy = groundY(x, z) ?? by - 1;
      for (let y = Math.min(gy, by - 1) - 1; y <= top; y++) g.put(x, y, z, y === top && y > by + 1 ? lit : bark);
    };
    for (let s = 0; s <= L; s += 0.2) {
      const k = s / L, ang = a + curl * k * k + Math.sin(k * 4 + ph) * 0.06, d = r0 * 0.75 + s;
      const x = Math.round(bx + Math.cos(ang) * d), z = Math.round(bz + Math.sin(ang) * d);
      if (x === px && z === pz) continue;
      const hh = Math.round(H * Math.pow(1 - k, 1.55) + (k < 0.15 ? (0.15 - k) * 8 : 0));
      const top = by - 1 + Math.max(1, hh);
      col(x, z, top);
      if (px !== null && x !== px && z !== pz) col(px, z, top);   // 4-connected
      if (k < thick) {                                            // inner part 2 thick: a parallel row on the left side
        const nx = Math.round(bx + Math.cos(ang) * d - Math.sin(ang) * 0.9), nz = Math.round(bz + Math.sin(ang) * d + Math.cos(ang) * 0.9);
        col(nx, nz, top - 1 - Math.round(k * 3));
      }
      cells.push([x, z]);
      px = x; pz = z;
    }
    // surface root: keeps snaking along the ground past the fin's end, 1 high, dives under
    const end = cells[cells.length - 1];
    let ang = a + curl, x = end[0], z = end[1];
    const rl = 4 + Math.round(S(i + 100) * 7);
    for (let s = 1; s <= rl; s++) {
      ang += (S(i * 31 + s) - 0.5) * 0.6;
      const nx = Math.round(x + Math.cos(ang)), nz = Math.round(z + Math.sin(ang));
      if (nx !== x && nz !== z) { const gy = groundY(nx, z); if (gy != null) g.put(nx, gy + (s < rl - 1 ? 1 : 0), z, bark); }
      x = nx; z = nz;
      const gy = groundY(x, z);
      if (gy == null) break;
      g.put(x, gy + (s < rl - 1 ? 1 : 0), z, bark);
    }
    fins.push({ a, L, H, end: [x, z] });
  }
  return fins;
}

/**
 * Sculpt in a local frame standing on a trunk side: origin O = [x, y, z] (float), outward unit direction d = [dx, dz].
 * Local coords: u = lateral (to the right looking at the trunk from outside), y = up, w = outward. fn(u, y, w) → id | 0.
 * ext = [uMax, yMin, yMax, wMin, wMax] bounds in local units.
 */
export function sculpt(g, O, d, ext, fn, mode = 'replace') {
  const [dx, dz] = d, px = dz, pz = -dx;                          // lateral axis
  const [uM, y0, y1, w0, w1] = ext;
  const R = Math.hypot(uM, Math.max(Math.abs(w0), Math.abs(w1))) + 1;
  for (let wy = Math.floor(O[1] + y0); wy <= Math.ceil(O[1] + y1); wy++) {
    for (let wz = Math.floor(O[2] - R); wz <= Math.ceil(O[2] + R); wz++) for (let wx = Math.floor(O[0] - R); wx <= Math.ceil(O[0] + R); wx++) {
      const rx = wx + 0.5 - O[0], rz = wz + 0.5 - O[2];
      const u = rx * px + rz * pz, w = rx * dx + rz * dz, y = wy + 0.5 - O[1];
      if (Math.abs(u) > uM + 0.5 || w < w0 - 0.5 || w > w1 + 0.5) continue;
      const m = fn(u, y, w, wx, wy, wz);
      if (m) g.put(wx, wy, wz, m, mode);
    }
  }
}

const ell = (x, y, z, c, r) => Math.hypot((x - c[0]) / r[0], (y - c[1]) / r[1], (z - c[2]) / r[2]) - 1;
const capsule = (x, y, z, a, b, r) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [x - a[0], y - a[1], z - a[2]];
  const t = clamp((ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) - r;
};

/**
 * Malayan sun bear clinging to a trunk, seen from behind: O = point on the trunk surface at the bear's feet, d = outward
 * direction (toward the viewer). Arms flung up round the trunk, legs splayed and gripping, head turned to one side so
 * the pale muzzle shows in profile (looking up at the honey). ~9 tall, k = scale.
 */
export function sunBear(g, O, d, k = 1, o = {}) {
  const fur = g.mat('giant_bearFur'), fur2 = g.mat('giant_bearFur2'), muz = g.mat('giant_bearMuzzle'), chest = g.mat('giant_bearChest');
  const claw = g.mat('giant_claw'), nose = g.mat('giant_bearNose'), tongue = g.mat('giant_tongue');
  const look = o.look ?? 1;                                      // +1: head turned toward +u
  sculpt(g, O, d, [4.2 * k, -0.6 * k, 10.5 * k, -0.8 * k, 3.4 * k], (u0, y0, w0) => {
    const u = u0 / k, y = y0 / k, w = w0 / k;
    const au = Math.abs(u), ul = u * look;
    const torso = Math.min(ell(u, y, w, [0, 4.3, 1.25], [1.95, 2.5, 1.25]), ell(u, y, w, [0, 2.3, 1.45], [1.85, 1.45, 1.3]));
    const head = ell(ul, y, w, [0.35, 7.5, 1.45], [1.35, 1.25, 1.25]);
    const snout = ell(ul, y, w, [1.65, 7.75, 1.85], [0.85, 0.62, 0.7]);
    const ear = Math.min(ell(ul, y, w, [-0.7, 8.7, 1.3], [0.5, 0.5, 0.45]), ell(ul, y, w, [1.0, 8.75, 1.0], [0.5, 0.5, 0.45]));
    const arm = Math.min(capsule(au, y, w, [1.5, 5.6, 1.15], [2.65, 8.2, 0.35], 0.62), capsule(au, y, w, [2.65, 8.2, 0.35], [2.75, 8.9, -0.3], 0.5));
    const leg = Math.min(capsule(au, y, w, [1.3, 2.1, 1.2], [2.55, 1.3, 0.9], 0.7), capsule(au, y, w, [2.55, 1.3, 0.9], [2.4, -0.1, 0.1], 0.55));
    const tail = ell(u, y, w, [0, 1.2, 2.55], [0.45, 0.45, 0.4]);
    const tng = o.tongue ? capsule(ul, y, w, [2.45, 8.6, 1.9], [2.6, 9.7, 1.85], 0.5) : 1;      // reaching up for the honey
    if (tng < 0 && snout >= 0) return tongue;
    if (snout < 0) return ul > 2.2 && y > 7.6 ? nose : muz;
    if (Math.min(head, ear) < 0) return fur;
    if (torso < 0 || tail < 0) {
      if (w < 0.55 && au > 1.1 && y > 4.4 && y < 6) return chest;   // a glimpse of the golden crescent under the arms
      return hash3(Math.round(u0), Math.round(y0), Math.round(w0), 9) < 0.18 ? fur2 : fur;
    }
    if (arm < 0) return y > 8.55 ? claw : fur;
    if (leg < 0) return y < 0.15 ? claw : fur;
    return 0;
  });
}

/**
 * Giant honey bee comb (Apis dorsata) hanging under a branch: a half-moon sheet in the vertical plane through the
 * branch direction (dx, dz), its top at y. A gold comb rim all the way round, the face covered in irregular patches
 * of clustering bees with the honeycomb showing between them.
 */
export function beeComb(g, top, dir, o = {}) {
  const [cx, y, cz] = top, [dx, dz] = dir;
  const W = o.width ?? 3.6, H = o.height ?? 4.5;
  const N = noise(o.seed ?? 17);
  const bees = g.mat('giant_bees'), bees2 = g.mat('giant_beesGold'), comb = g.mat('giant_comb'), combD = g.mat('giant_combDark');
  const S = Math.ceil(W), depthOf = (s) => (Math.abs(s) > S ? -1 : Math.round(H * Math.sqrt(Math.max(0, 1 - (s / (W + 0.5)) ** 2))));
  for (let s = -S; s <= S; s++) {
    const depth = depthOf(s);
    for (let k = 0; k <= depth; k++) for (const t of [0, 1]) {
      const x = Math.round(cx + dx * s + (t ? -dz : 0)), z = Math.round(cz + dz * s + (t ? dx : 0));
      const rim = k === 0 || k >= depth || k > depthOf(s - 1) || k > depthOf(s + 1);
      let m;
      if (rim) m = k === 0 && t ? combD : comb;
      else {
        const blot = hash3(Math.floor((s + 9) / 2), Math.floor((k + (s & 1)) / 2), 1, 9) * 0.65 + hash3(s, k, t, 4) * 0.35 + N.simplex2(s * 0.4, k * 0.4) * 0.15;
        m = blot > 0.4 ? (hash3(s, k, t, 5) < 0.2 ? bees2 : bees) : ((s + k) & 1 ? comb : combD);
      }
      g.put(x, y - k, z, m, 'replace');
    }
  }
  // honey dripping from the lowest cells
  for (let k = 1; k <= (o.drips ?? 0); k++) g.put(Math.round(cx), y - depthOf(0) - k, Math.round(cz), comb, 'keep');
}

/**
 * Hornbill nest hole sealed with mud in a trunk: the mud plaster bulges out of the bark, a vertical slit in the middle
 * with the female's bill tip poking out to take the food. c = trunk centre [x, z], y0 = bottom of the seal, d = outward.
 * Returns { slit: [x, y, z] (outside the slit), perch: [x, y, z] (standing cell for the male on a stub branch, facing d⁻) }.
 */
export function hornbillNest(g, c, y0, d, o = {}) {
  const [dx, dz] = d, px = dz, pz = -dx;
  const mud = g.mat('giant_mud'), mudD = g.mat('giant_mudDark'), dark = g.mat('giant_nestDark');
  const bill = g.mat('giant_billTip'), bill2 = g.mat('giant_billRed');
  const rS = surfaceAt(g, c[0], y0 + 3, c[1], dx, dz);
  const at = (u, w) => [Math.round(c[0] + dx * w + px * u), Math.round(c[1] + dz * w + pz * u)];
  // cavity inside the trunk
  for (let y = y0; y <= y0 + 6; y++) for (let u = -1; u <= 1; u++) for (let w = rS - 3.5; w <= rS - 1; w += 0.5) {
    const [x, z] = at(u, w); g.set(x, y, z, dark);
  }
  // mud seal: the outer shell of the hole, bulging out in a lens
  for (let y = y0; y <= y0 + 6; y++) for (let u = -2; u <= 2; u++) {
    const rows = Math.abs(u) === 2 ? [1, 5] : Math.abs(u) === 1 ? [0, 6] : [0, 6];
    if (y - y0 < rows[0] || y - y0 > rows[1]) continue;
    const [x, z] = at(u, rS - 0.6);
    g.set(x, y, z, hash3(x, y, z, 3) < 0.3 ? mudD : mud);
    if (Math.abs(u) <= 1 && y - y0 >= 1 && y - y0 <= 5) { const [x2, z2] = at(u, rS + 0.4); g.set(x2, y, z2, hash3(x2, y, z2, 4) < 0.3 ? mudD : mud); }
  }
  // the slit + the female's bill tip
  for (let y = y0 + 2; y <= y0 + 4; y++) for (const w of [rS - 0.6, rS + 0.4]) { const [x, z] = at(0, w); g.set(x, y, z, dark); }
  { const [x, z] = at(0, rS + 0.4); g.set(x, y0 + 3, z, bill); g.set(x, y0 + 2, z, bill2); }
  // a stub branch off to one side, just below the hole: the male stands on it beside the slit, in profile, a ripe fig
  // held out between his bill and the slit (the seal and her bill stay in view)
  const side = o.side ?? 1, pu = 3 * side, pw = rS + 1.6;
  for (let w = rS - 2; w <= pw + 1.5; w += 0.5) { const [x, z] = at(pu, w); g.put(x, y0 - 2, z, 'giant_stub'); }
  { const [x, z] = at(pu + side, pw + 1); g.put(x, y0 - 1, z, 'giant_stub'); }            // a little twig
  { const [x, z] = at(side, rS + 1.4); g.put(x, y0 + 3, z, 'figFruit'); }
  const P0 = [c[0] + dx * pw + px * pu, c[1] + dz * pw + pz * pu], T = [c[0] + dx * (rS + 0.4), c[1] + dz * (rS + 0.4)];
  const heading = Math.atan2(T[0] - P0[0], T[1] - P0[1]) * 180 / Math.PI;
  const [sx, sz] = [Math.floor(P0[0]), Math.floor(P0[1])];
  return { slit: [...at(0, rS + 1.4), y0 + 3], perch: [sx + 0.5, y0 - 1, sz + 0.5, heading], rS };
}

/**
 * Observation platform around a trunk: chamfered square deck (half-size S) at y, rim beams, braces down to the trunk,
 * a bamboo railing with gaps at `gaps` ([[x, z], …] deck-edge cells kept open), lantern. c = [x, z] trunk centre.
 */
export function ringDeck(g, c, y, o = {}) {
  const S = o.S ?? 7, rIn = o.rIn ?? 4, ch = o.chamfer ?? 2;
  const inDeck = (u, v) => Math.abs(u) <= S && Math.abs(v) <= S && Math.abs(u) + Math.abs(v) <= 2 * S - ch;
  const gaps = o.gaps ?? [];
  const isGap = (x, z) => gaps.some(([gx, gz]) => Math.hypot(x - gx, z - gz) < 1.6);
  const cx = Math.round(c[0]), cz = Math.round(c[1]);
  for (let u = -S; u <= S; u++) for (let v = -S; v <= S; v++) {
    if (!inDeck(u, v) || Math.hypot(u, v) < rIn) continue;
    const x = cx + u, z = cz + v;
    const rim = !inDeck(u + 1, v) || !inDeck(u - 1, v) || !inDeck(u, v + 1) || !inDeck(u, v - 1);
    g.put(x, y, z, rim ? 'plankDark' : hash3(x, 0, z, 7) < 0.15 ? 'plankLight' : 'plank');
    if (rim) {
      g.put(x, y - 1, z, 'beam');
      if (!isGap(x, z)) {
        if ((u + v) % 3 === 0) g.box([x, y + 1, z], [x, y + 3, z], 'beam'); else g.put(x, y + 3, z, 'bambooPole');
        if ((u + v) % 3 === 0) g.put(x, y + 1, z, 'beam');
      }
    }
  }
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const k = Math.abs(a) + Math.abs(b) === 2 ? 0.72 : 1;
    g.line([cx + a * (rIn - 0.5) * k, y - 7, cz + b * (rIn - 0.5) * k], [cx + a * (S - 1) * k, y - 1, cz + b * (S - 1) * k], 'beam');
  }
  return { inDeck: (x, z) => inDeck(x - cx, z - cz) };
}
