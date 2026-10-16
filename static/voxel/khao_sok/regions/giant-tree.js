// The giant's own tree (regions/giant.js): a pale tapering bole forking into 7 thick limbs under a broad umbrella
// crown of separate cauliflower lobes at varied heights — sunlit gold domes, dark crevices between the lobes, dark
// blue-green undersides and a couple of notches in the rim where the sky shows through. Everything is deterministic.
import { rng, noise, hash3, clamp } from '../../lib/index.js';
import { paleBark } from './giant-parts.js';

const TAU = Math.PI * 2;
const SHADES = ['canopyBlue', 'jungleLeafDark', 'jungleLeaf', 'jungleLeafLight', 'jungleLeafSun', 'giant_leafGold'];

function disc(g, cx, y, cz, r, m) {
  const rr = r * r + 0.01;
  for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
    if ((x - cx) ** 2 + (z - cz) ** 2 <= rr) g.put(x, y, z, m);
}

/**
 * Lobed crown: lumps [{ c, r, sq, flat, b, lobe, dome }]. Each voxel belongs to its nearest lump; shade by its height
 * inside that lump (dark undersides → lit caps); gold / sun only on exposed dome tops; voxels where two different
 * lobes meet become dark crevices. 'keep' mode.
 */
function lobedCrown(g, L, o = {}) {
  const sh = SHADES.map((m) => g.mat(m));
  const N = noise(o.seed ?? 7);
  const amp = 0.17, f = 0.3;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const l of L) {
    l.ry = l.r * l.sq;
    const e = [l.r + 1, l.ry + 1, l.r + 1];
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], Math.floor(l.c[k] - e[k])); hi[k] = Math.max(hi[k], Math.ceil(l.c[k] + e[k])); }
  }
  const H = hi[1] - lo[1] + 2;
  const inside = new Uint8Array(H), lump = new Array(H), gap = new Float32Array(H);
  const perLobe = new Float64Array(Math.max(...L.map((l) => l.lobe)) + 1);
  for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
    const C = [];
    for (const l of L) { const dx = (x - l.c[0]) / l.r, dz = (z - l.c[2]) / l.r, q = dx * dx + dz * dz; if (q < 1.6) C.push([l, q]); }
    if (!C.length) continue;
    inside.fill(0);
    for (let y = lo[1]; y <= hi[1]; y++) {
      let best = Infinity, bl = null;
      perLobe.fill(Infinity);
      for (const [l, q] of C) {
        const dy = (y - l.c[1]) / l.ry;
        if (dy < -l.flat) continue;
        const d = q + dy * dy;
        if (d < perLobe[l.lobe]) perLobe[l.lobe] = d;
        if (d < best) { best = d; bl = l; }
      }
      if (!bl) continue;
      let second = Infinity;
      for (let k = 0; k < perLobe.length; k++) if (k !== bl.lobe && perLobe[k] < second) second = perLobe[k];
      const n = N.simplex3(x * f, y * f * 1.3, z * f);
      if (Math.sqrt(best) + n * amp > 1) continue;
      const i = y - lo[1];
      inside[i] = 1; lump[i] = bl; gap[i] = Math.sqrt(second) - Math.sqrt(best);
    }
    for (let y = lo[1]; y <= hi[1]; y++) {
      const i = y - lo[1];
      if (!inside[i]) continue;
      const bl = lump[i], u = (y - bl.c[1]) / bl.ry, top = !inside[i + 1];
      const n = N.simplex3(x * 0.21 + 9, y * 0.21, z * 0.21);
      let k = Math.floor((0.38 + 0.5 * u + bl.b + n * 0.08 + (hash3(x, y, z, 5) - 0.5) * 0.05) * SHADES.length);
      k = clamp(k, 0, SHADES.length - 1);
      if (top) {                                                            // the sunlit skin: light → sun → gold caps
        if (u > 0.05) k = Math.max(k, 3);
        if (u > 0.28 + n * 0.1) k = Math.max(k, 4);
        if (bl.dome && u > 0.46 + n * 0.1) k = 5;
      } else if (k >= 4) k = 3;                                             // never on the sides / inside
      if (k === 5 && !bl.dome) k = 4;
      if (u < -0.12) k = Math.min(k, u < -0.45 ? 0 : 1);                   // dark undersides
      if (gap[i] < 0.16 && u < 0.75) k = hash3(x, y, z, 6) < 0.45 ? 0 : 1;  // crevices between lobes
      g.put(x, y, z, sh[k], 'keep');
    }
  }
}

/**
 * The giant: base = [x, y (standing), z]. o: height (top of the central dome above y), crownRadius (outer, ~29),
 * trunkRadius, fork (fork height above y), view ([dx, dz] toward the camera: notches go to the back and the sides),
 * seed. Returns { top, crownY, crownRadius, limbs: points on the limbs, tips: lobe bases, fork }.
 */
export function giantTree(g, base, o = {}) {
  const [bx, by, bz] = base;
  const R = rng(o.seed ?? 7);
  const top = by + (o.height ?? 107);
  const Rc = o.crownRadius ?? 29, r0 = o.trunkRadius ?? 6, r1 = r0 * 0.58;
  const forkY = by + (o.fork ?? 72);
  const bark = paleBark(g, by + 1, (o.seed ?? 7) + 14);
  // bole: straight, gently tapering, a couple of broken stubs
  for (let y = by - 3; y <= forkY + 3; y++) {
    const t = clamp((y - by) / (forkY - by)), r = r0 + (r1 - r0) * Math.pow(t, 0.7);
    disc(g, bx, y, bz, r, bark);
  }
  for (const [a, f] of [[R() * TAU, 0.55], [R() * TAU, 0.78]]) {
    const y = Math.round(by + (forkY - by) * f), r = r0 + (r1 - r0) * Math.pow(f, 0.7);
    g.line([bx + Math.cos(a) * (r - 0.5), y, bz + Math.sin(a) * (r - 0.5)], [bx + Math.cos(a) * (r + 1.6), y + 2, bz + Math.sin(a) * (r + 1.6)], 'barkPaleDark', { r: 0.6 });
  }
  // crown plan: a central dome + 7 rim positions, two of them notches (small low lobes: the sky shows past them)
  const va = Math.atan2((o.view ?? [0, 1])[1], (o.view ?? [0, 1])[0]);
  const notchAt = [va + Math.PI - 0.75, va - Math.PI / 2 - 0.15];          // back-left and screen-right
  const L = [], lobes = [];
  const cb = top - 19;                                                      // crown base (lowest leaves)
  const lobe = (id, cx, cz, r, domeTop, b) => {
    const sq = 0.64, cy = domeTop - r * sq;
    const main = { c: [cx, cy, cz], r, sq, b, lobe: id, dome: true };
    L.push(main);
    const out = Math.atan2(cz - bz, cx - bx), ns = 3 + (R() < 0.5 ? 1 : 0);
    for (let k = 0; k < ns; k++) {
      const a = out + (k - (ns - 1) / 2) * R.range(1.0, 1.4) + R.range(-0.25, 0.25), rs = r * R.range(0.48, 0.6);
      L.push({ c: [cx + Math.cos(a) * r * 0.85, cy - R.range(0.5, 2.5), cz + Math.sin(a) * r * 0.85], r: rs, sq: 0.72, b: b + R.range(-0.05, 0.03), lobe: id, dome: false });
    }
    lobes.push(main);
    return main;
  };
  lobe(0, bx, bz, Rc * 0.36, top, 0.05);
  for (let i = 0; i < 7; i++) {
    const a = va + 0.35 + (i / 7) * TAU + R.range(-0.12, 0.12);
    const notch = notchAt.some((q) => Math.abs(Math.atan2(Math.sin(a - q), Math.cos(a - q))) < TAU / 14);
    if (notch) { const d = Rc * 0.36; lobe(i + 1, bx + Math.cos(a) * d, bz + Math.sin(a) * d, Rc * 0.16, top - R.range(11, 13), -0.06); continue; }
    const r = Rc * R.range(0.32, 0.36), d = Rc - r * 0.95 - R.range(0, 1);
    lobe(i + 1, bx + Math.cos(a) * d, bz + Math.sin(a) * d, r, top - [3, 8, 4.5, 10, 6, 2.5, 7][i] - R.range(0, 1.5), R.range(-0.04, 0.05));
  }
  for (const l of L) l.flat = Math.max(0.25, (l.c[1] - (cb + R.range(-0.5, 1.5))) / (l.r * l.sq));
  lobedCrown(g, L, { seed: R.int(0, 1e6) });
  // limbs (after the crown, 'keep': they show only below the leaves): 7 primaries from the fork, twigs into the florets
  const limbs = [], tips = [];
  const tube = (pts, r, r2) => g.tube(pts, bark, { r, r2, steps: 5, mode: 'keep' });
  for (const m of lobes) {
    const end = [m.c[0], m.c[1] - m.ry * 0.55, m.c[2]];
    const dx = end[0] - bx, dz = end[2] - bz;
    const knee = [bx + dx * 0.42, forkY + (end[1] - forkY) * 0.55, bz + dz * 0.42];
    const central = Math.hypot(dx, dz) < 2;
    tube([[bx, forkY - 1, bz], knee, end], central ? r1 * 0.8 : r1 * 0.62, central ? 1.2 : 1.0);
    limbs.push(knee.map(Math.round), [bx + dx * 0.7, forkY + (end[1] - forkY) * 0.8, bz + dz * 0.7].map(Math.round));
    tips.push(end.map(Math.round));
  }
  for (const l of L) if (!l.dome) {
    const m = lobes.find((q) => q.lobe === l.lobe);
    tube([[m.c[0], m.c[1] - m.ry * 0.5, m.c[2]], [l.c[0], l.c[1] - l.ry * 0.6, l.c[2]]], 0.75, 0.5);
  }
  return { top: [bx, top, bz], crownY: cb, crownRadius: Rc, limbs, tips, fork: [bx, forkY, bz] };
}
