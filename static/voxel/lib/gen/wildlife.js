// Rainforest ground & water wildlife creatures (Khao Sok): elephant, tapir, sun bear, wild boar, muntjac,
// tiger, macaque, monitor lizard, otter, snakes… Rig factories for stage.actors(), registered by name.
// Conventions: see creatures.js and docs/animation.md (rig space: feet at y = 0, facing +z).
//
//   const herd = stage.actors({ creature: 'elephant', count: 3, variants: 3, area });
//   stage.actors({ creature: 'elephant', options: { baby: true }, behavior: 'follow', target: herd, spacing: 11 });
//   stage.actors({ creature: 'snake', options: { kind: 'python' }, area });
//
// Bodies are signed-distance blobs voxelized per part (sdfPart), so proportions are continuous numbers.
// Bendy things (trunks, tails, snakes, lizards) are chains of rigid segments moved with "slide joints":
// a part rotating about a pivot far away (FAR voxels) moves almost rigidly, so one Euler rotation per part
// gives a segment its own yaw (or pitch) plus a translation — see slideYaw / slidePitch / chainParts.
import { VoxelGrid } from '../grid.js';
import '../shapes.js';
import { Palette } from '../palette.js';
import { rng, hash3 } from '../random.js';
import { shade } from '../color.js';
import { rig } from '../actors.js';
import { defineCreature } from '../registry.js';

// ---- helpers ----------------------------------------------------------------------------------------

const FAR = 120;
const cl1 = (v) => Math.max(-1, Math.min(1, v));
const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Euler angles for a part whose pivot is FAR voxels straight below its reference point: the part turns by
 * `yaw` about the vertical axis through the reference point and moves by (dx, dz). Use with pivot
 * [rx, ry - FAR, rz] (see slideYawPivot). Error < 0.1 voxel for moves up to ~10 voxels.
 */
export function slideYaw(dx, dz, yaw) {
  const c = Math.asin(cl1(-dx / (FAR * Math.cos(yaw))));
  const K = Math.hypot(Math.cos(c), Math.sin(c) * Math.sin(yaw)), phi = Math.atan2(Math.sin(c) * Math.sin(yaw), Math.cos(c));
  return { rx: Math.asin(cl1(dz / (FAR * K))) - phi, ry: yaw, rz: c };
}
/** Like slideYaw, but pitches (about x through the reference point) and moves by (dy, dz); pivot [rx - FAR, ry, rz]. */
export function slidePitch(dy, dz, pitch) {
  const s = (dy * Math.cos(pitch) + dz * Math.sin(pitch)) / FAR, q = (dy * Math.sin(pitch) - dz * Math.cos(pitch)) / FAR;
  const c = Math.asin(cl1(s));
  return { rx: pitch, ry: Math.asin(cl1(q / Math.cos(c))), rz: c };
}
const yawPivot = (p) => [p[0], p[1] - FAR, p[2]];
const pitchPivot = (p) => [p[0] - FAR, p[1], p[2]];

// signed distances (rig space, voxel centers)
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
function ell(x, y, z, c, r) {
  const a = (x - c[0]) / r[0], b = (y - c[1]) / r[1], d = (z - c[2]) / r[2];
  const k0 = len3(a, b, d);
  if (k0 < 1e-6) return -Math.min(r[0], r[1], r[2]);
  return (k0 * (k0 - 1)) / len3(a / r[0], b / r[1], d / r[2]);
}
/** tapered capsule a→b, radius r1→r2 */
function cap(x, y, z, a, b, r1, r2 = r1) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], px = x - a[0], py = y - a[1], pz = z - a[2];
  const t = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz || 1)));
  return len3(px - dx * t, py - dy * t, pz - dz * t) - (r1 + (r2 - r1) * t);
}
const smin = (a, b, k = 1.5) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
/** distance to a polyline + arc parameter: → [dist, segment index, s (0..1 along the whole line)] */
function polyDist(x, y, z, pts) {
  let best = Infinity, bi = 0, bs = 0, acc = 0;
  const L = [];
  for (let i = 0; i < pts.length - 1; i++) L.push(len3(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]));
  const tot = L.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / (L[i] * L[i] || 1)));
    const d = len3(x - a[0] - dx * t, y - a[1] - dy * t, z - a[2] - dz * t);
    if (d < best) { best = d; bi = i; bs = (acc + t * L[i]) / tot; }
    acc += L[i];
  }
  return [best, bi, bs];
}

/** a part grid from a signed distance fn(x, y, z) over [lo, hi] (voxel centers); mat(x, y, z, d) → material */
function sdfPart(P, lo, hi, fn, mat) {
  const g = new VoxelGrid(P);
  g.sdf(fn, lo.map(Math.floor), hi.map(Math.ceil), mat);
  return g;
}
/** delete from `g` every cell that `moving` occupies (the moving part owns the overlap; its socket shows when it moves) */
function carve(g, ...moving) { for (const m of moving) m.forEach((x, y, z) => g.del(x, y, z)); return g; }
/** outermost voxel of g in row (y, z) on side ±1 (x), or null */
function sideX(g, y, z, side) {
  const b = g.bounds();
  if (!b) return null;
  if (side > 0) { for (let x = b.max[0]; x >= b.min[0]; x--) if (g.get(x, y, z)) return x; } else for (let x = b.min[0]; x <= b.max[0]; x++) if (g.get(x, y, z)) return x;
  return null;
}
/** paint 1 eye voxel on each side of g at row (y, z) */
function eyes(g, y, z, m = 'eye') { for (const s of [-1, 1]) { const x = sideX(g, Math.floor(y), Math.floor(z), s); if (x != null) g.set(x, Math.floor(y), Math.floor(z), m); } return g; }
/** frontmost voxel (max z) of column (x, y) */
function frontZ(g, x, y) { const b = g.bounds(); for (let z = b.max[2]; z >= b.min[2]; z--) if (g.get(x, y, z)) return z; return null; }

/**
 * A planar chain of rigid segments (trunk, tail…): grids[j] holds segment j between joints[j] and joints[j+1].
 * bend(a) → per-joint angle increments (radians; index 0 bends the whole chain at joints[0]); base(a) → optional
 * { dy|dx, dz, ang } motion of joint 0 (what the chain hangs from). plane 'pitch' (bends in y–z, positive =
 * tip back/down) | 'yaw' (bends in x–z). Returns rig parts (role 'static', slide-jointed).
 */
function chainParts(name, grids, joints, plane, bend, base) {
  const pitch = plane === 'pitch', n = grids.length;
  let ck = null, out = null;
  const solve = (a) => {
    if (ck && ck.ag === a.agent && ck.t === a.t && ck.ph === a.phase) return out;
    const b = bend(a), b0 = base?.(a) ?? {};
    let ang = b0.ang ?? 0;
    let pu = joints[0][pitch ? 1 : 0] + ((pitch ? b0.dy : b0.dx) ?? 0), pz = joints[0][2] + (b0.dz ?? 0);
    out = [];
    for (let j = 0; j < n; j++) {
      ang += b[j] ?? 0;
      const J = joints[j], K = joints[j + 1];
      out.push(pitch ? slidePitch(pu - J[1], pz - J[2], ang) : slideYaw(pu - J[0], pz - J[2], ang));
      const vu = K[pitch ? 1 : 0] - J[pitch ? 1 : 0], vz = K[2] - J[2], c = Math.cos(ang), s = Math.sin(ang);
      if (pitch) { pu += vu * c - vz * s; pz += vu * s + vz * c; } else { pu += vu * c + vz * s; pz += -vu * s + vz * c; }
    }
    ck = { ag: a.agent, t: a.t, ph: a.phase };
    return out;
  };
  return grids.map((grid, j) => ({ name: `${name}${j}`, role: 'static', grid, pivot: pitch ? pitchPivot(joints[j]) : yawPivot(joints[j]), animate: (a) => solve(a)[j] }));
}

/**
 * Split a tube along polyline `pts` (radius r(s), s 0..1) into segment grids at the polyline's joints;
 * mat(x, y, z, s, i). Each segment's core (radius − 1) runs `overlap` voxels into the next one, hidden while
 * straight, filling the gap on the outside of a bend.
 */
function tubeSegments(P, pts, r, mat, skip, overlap = 1.5) {
  const grids = pts.slice(1).map(() => new VoxelGrid(P));
  const R = Math.max(r(0), r(1), r(0.5)) + 1;
  const lo = [0, 1, 2].map((k) => Math.floor(Math.min(...pts.map((p) => p[k])) - R)), hi = [0, 1, 2].map((k) => Math.ceil(Math.max(...pts.map((p) => p[k])) + R));
  for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
    const [d, i, s] = polyDist(x + 0.5, y + 0.5, z + 0.5, pts);
    if (d > r(s) || skip?.(x, y, z)) continue;
    const m = mat(x, y, z, s, i);
    grids[i].set(x, y, z, m);
    if (i > 0 && d <= r(s) - 1) {
      const a = pts[i], b = pts[i + 1], L = len3(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      if (((x + 0.5 - a[0]) * (b[0] - a[0]) + (y + 0.5 - a[1]) * (b[1] - a[1]) + (z + 0.5 - a[2]) * (b[2] - a[2])) / L < overlap) grids[i - 1].set(x, y, z, m);
    }
  }
  return grids;
}

/**
 * Forked tongue resting inside the head (stem at z0, tines at z0 + 1 when the head is wide enough there), to be
 * slid out along the head's direction by up to `reach` voxels: → { grid, reach }.
 */
function tongueIn(P, head, ty, z0, m = 'tongue') {
  const g = new VoxelGrid(P);
  g.set(-1, ty, z0, m);
  if (head.get(-2, ty, z0 + 1) && head.get(0, ty, z0 + 1)) { g.set(-2, ty, z0 + 1, m); g.set(0, ty, z0 + 1, m); } else g.set(-1, ty, z0 + 1, m);
  return { grid: g, reach: (frontZ(head, -1, ty) ?? z0) + 1 - z0 };
}
/** 0..1: how far a tongue is out — quick flicks in bursts */
const flick = (t, s) => sst(0.55, 0.85, Math.sin(t * 1.2 + s * 23)) * (0.5 + 0.5 * Math.sin(t * 26));

const legPart = (name, grid, side, pair, pivot, anim) => ({ name, role: 'leg', side, pair, grid, pivot, ...(anim ? { animate: anim } : {}) });

// ---- elephant -----------------------------------------------------------------------------------------

/**
 * Asian elephant: big grey wrinkly body, twin-domed head, small ears that flap, a curling trunk (a 4-segment
 * chain: swings with the gait, sways and curls up when idle), pillar legs with toenails, tufted tail.
 * opts: baby (calf: ~half size, rounder, fuzzy), tusks (bull; default: some adults by seed), seed, scale (0.5).
 * ~12.5 world voxels tall, ~17 long incl. trunk and tail (calf: scale 0.36, ~6 tall, ~8 long).
 */
export function elephant(o = {}) { // o: baby, tusks, skin (base colour, e.g. '#8d939c' wet slate), seed, scale
  const R = rng(o.seed ?? 1), baby = !!o.baby, tusks = o.tusks ?? (!baby && R.chance(0.35)), sd = (o.seed ?? 1) * 13;
  const k = baby ? 0.7 : 1, lg = baby ? 0.72 : 1, bl = baby ? 0.85 : 0.94, hb = baby ? 1.35 : 1.1, tl = baby ? 0.6 : 0.92;
  const legTop = 10 * k * lg, drop = 10 * k * (1 - lg);
  const pt = (x, y, z) => [x * k, y * k - drop, z * k * bl];
  const hc = pt(0, 18.4, 12.6);
  const hp = (x, y, z) => [hc[0] + x * k * hb, hc[1] + y * k * hb, hc[2] + z * k * hb];
  const kr = (r) => r.map((v) => v * k);
  const hr = (r) => r.map((v) => v * k * hb);
  // o.skin: base skin colour (actor `tints` multiply, so they can only darken — use skin to make a lighter/wet elephant)
  const sk = o.skin ?? (baby ? '#7b726c' : '#78726d');
  const P = new Palette({
    skin: { color: sk, jitter: 0.035, noise: { color: o.skin ? shade(sk, -0.07) : baby ? '#6d635c' : '#6a645f', scale: 0.45, amount: 0.55 },
      gradient: { color: o.skin ? shade(sk, 0.06) : baby ? '#8c8076' : '#8d8680', axis: 'y', from: pt(0, 15, 0)[1], to: pt(0, 23, 0)[1] } },
    skinDark: { color: o.skin ? shade(sk, -0.12) : '#645e59', jitter: 0.04 },
    pink: { color: '#b0948c', jitter: 0.05 },
    nail: { color: '#d9d0bf', jitter: 0.03 },
    tusk: { color: '#efe8d6', jitter: 0.02, roughness: 0.5 },
    tuft: { color: '#2c2724', jitter: 0.05 },
    fuzz: { color: '#86766a', jitter: 0.08 },
    eye: { color: '#15110e', roughness: 0.2 },
  });

  // body (+ neck): smooth blobs — arched back, sagging belly, rump lower than the shoulders
  const B = [[pt(0, 14, -0.5), kr([6.8, 7.4, 11.5 * bl])], [pt(0, 11, 0.5), kr([6.2, 5, 8.5 * bl])], [pt(0, 15, 5.5), kr([6.5, 7.2, 6 * bl])], [pt(0, 13.6, -7.5), kr([6.1, 6.6, 5.6 * bl])]];
  const bodyFn = (x, y, z) => { x = Math.abs(x); let d = ell(x, y, z, ...B[0]); for (let i = 1; i < B.length; i++) d = smin(d, ell(x, y, z, ...B[i]), 2 * k); return smin(d, cap(x, y, z, pt(0, 15.4, 6), hc, 4.6 * k, 4.2 * k * hb), 2 * k); };
  const bodyMat = () => 'skin';
  const body = sdfPart(P, [-8 * k, 4 * k - drop, -14 * k], [8 * k, 25 * k, 14 * k], bodyFn, bodyMat);

  // head: cranium, twin domes, face, jaw
  const H = [[[0, 0, 0], [4.4, 5, 4.2]], [[0, -1.8, 2.4], [3.4, 4.2, 2.6]], [[0, -5, 0.8], [2.6, 2, 2.6]]].map(([c, r]) => [hp(...c), hr(r)]);
  const domes = [-1, 1].map((s) => hp(s * 2.1, 3.6, -0.6));
  const headFn = (x, y, z) => {
    const ax = Math.abs(x);
    let d = ell(ax, y, z, ...H[0]);
    d = smin(d, ell(ax, y, z, ...H[1]), 1.5 * k);
    d = smin(d, ell(ax, y, z, ...H[2]), 1.5 * k);
    for (const dc of domes) d = smin(d, len3(x - dc[0], y - dc[1], z - dc[2]) - 2.5 * k * hb, 1.2 * k);
    return d;
  };
  const faceZ = hp(0, 0, 2.2)[2];
  const headMat = (x, y, z) => (z + 0.5 > faceZ && y + 0.5 < hc[1] - 2.5 * k * hb && hash3(x, y, z, sd + 2) < 0.2 ? 'pink' : 'skin');
  const head = sdfPart(P, [hc[0] - 6 * k * hb, hc[1] - 8 * k * hb, hc[2] - 6 * k * hb], [hc[0] + 6 * k * hb, hc[1] + 7 * k * hb, hc[2] + 6 * k * hb], headFn, headMat);
  eyes(head, hp(0, 0.4, 2.5)[1], hp(0, 0, 2.5)[2]);

  // trunk: 4 segments hanging from the face, tip curled forward
  const tj = [[0, -2.6, 3.4], [0, -6.4, 5.5], [0, -10, 6.2], [0, -13.4, 6.0], [0, -16.0, 7.0], [0, -16.6, 8.6]].map(([x, y, z]) => [x, y * tl, z * (baby ? 0.8 : 1)]).map((p) => hp(...p));
  if (tj[tj.length - 1][1] < 1) { const lift = 1 - tj[tj.length - 1][1]; for (const p of tj) p[1] += lift * Math.max(0, (hc[1] - p[1]) / (hc[1] - tj[tj.length - 1][1])); }
  const joints = [tj[0], tj[1], tj[2], tj[3], tj[5]];
  const trR = (s) => (2.3 - 1.25 * s) * k * hb;
  const inHead = (x, y, z) => headFn(x + 0.5, y + 0.5, z + 0.5) < -2.2 * k;
  const trunk = tubeSegments(P, tj, trR, (x, y, z, s) => {
    const ring = Math.floor(s * 22 * tl) % 3 === 1;
    if (s > 0.9) return hash3(x, y, z, sd + 8) < 0.45 ? 'pink' : 'skinDark';
    if (s < 0.3 && hash3(x, y, z, sd + 4) < 0.2) return 'pink';
    return ring ? 'skinDark' : 'skin';
  }, inHead);
  // 5 polyline pieces → 4 chain segments (the curled tip joins the last one)
  trunk[3].stamp(trunk.pop());
  for (const t of trunk) carve(head, t);
  if (tusks) for (const s of [-1, 1]) head.line(hp(s * 2.3, -4.2, 2.2), hp(s * 2.7, -5.8, 5.2), 'tusk', { r: 0.6 * k });

  // ears: 1-voxel plates lying on the side of the head/neck, hinged at the front edge
  const earC = hp(0, -0.9, -1.5);
  const earIn = (y, z) => { const a = ((z - earC[2]) / (2.8 * k * hb)) ** 2 + ((y - earC[1]) / (3.6 * k * hb)) ** 2, b = ((z - earC[2] + 1.3 * k * hb) / (1.7 * k * hb)) ** 2 + ((y - earC[1] + 3.1 * k * hb) / (2.2 * k * hb)) ** 2; return Math.min(a, b) <= 1; };
  const ears = [-1, 1].map((side) => {
    const g = new VoxelGrid(P);
    let fz = -Infinity;
    for (let y = Math.floor(earC[1] - 7 * k * hb); y <= earC[1] + 6 * k * hb; y++) for (let z = Math.floor(earC[2] - 5 * k * hb); z <= earC[2] + 4 * k * hb; z++) {
      if (!earIn(y + 0.5, z + 0.5)) continue;
      const xs = [sideX(head, y, z, side), sideX(body, y, z, side)].filter((v) => v != null);
      const sx = xs.length ? (side > 0 ? Math.max(...xs) : Math.min(...xs)) : side * Math.round(3 * k);
      const x = sx + side * (z + 0.5 < earC[2] - 0.8 * k * hb ? 2 : 1);   // the back of the ear stands off the head
      const edge = !earIn(y + 1.5, z + 0.5) || !earIn(y + 0.5, z - 0.5), lower = y + 0.5 < earC[1] - 1 * k && z + 0.5 > earC[2] - 1.5 * k;
      g.set(x, y, z, edge ? 'skinDark' : lower && hash3(x, y, z, sd + 5) < 0.4 ? 'pink' : 'skin');
      if (x !== sx + side) g.set(x - side, y, z, 'skin');
      fz = Math.max(fz, z);
    }
    const b = g.bounds();
    const ax = side > 0 ? b.min[0] : b.max[0] + 1;
    return { name: side < 0 ? 'earL' : 'earR', role: 'static', side, grid: g, pivot: [ax, earC[1], fz + 1] };
  });

  // legs: pillars with crease rings and toenails
  const legs = [];
  for (const [pair, lz] of [[0, 7], [1, -8]]) for (const side of [-1, 1]) {
    const cx = side * 4.2 * k, cz = lz * k * bl, r = 2.85 * k * (baby ? 1.05 : 1);
    const g = sdfPart(P, [cx - r - 1, 0, cz - r - 1], [cx + r + 1, legTop, cz + r + 1], (x, y, z) => Math.hypot(x - cx, z - cz) - (r + (y < 1.6 * k ? 0.35 * k : 0)), (x, y, z) => {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz, th = Math.atan2(dx, dz);
      if (y === 0 && dz > 0 && Math.abs(th) < 1.05 && Math.round(th / 0.5) % 2 === 0) return 'nail';
      if ((y === Math.round(2.5 * k) || y === Math.round(5.5 * k)) && hash3(x, y, z, sd + 6) < 0.7) return 'skinDark';
      return 'skin';
    });
    carve(body, g);
    legs.push(legPart(`leg${pair ? 'B' : 'F'}${side < 0 ? 'L' : 'R'}`, g, side, pair, [cx, legTop, cz]));
  }

  // tail: thin rope down the rump with a dark tuft; swishes
  const tail = new VoxelGrid(P);
  const t0 = pt(0, 17, -12), t1 = pt(0, 13, -12.9), t2 = pt(0, 9, -12.7);
  tail.line(t0, t1, 'skin'); tail.line(t1, t2, 'skin');
  tail.box([0, Math.floor(t2[1]) - 1, Math.floor(t2[2])], [baby ? 0 : 1, Math.floor(t2[1]), Math.floor(t2[2])], 'tuft');
  const tailP = { name: 'tail', role: 'static', grid: tail, pivot: [0.5, t0[1] + 0.5, t0[2] + 0.5] };

  if (baby) { // fuzzy calf: sparse hairs on the head and back
    for (const g of [head, body]) {
      const add = [];
      g.forEach((x, y, z) => { if (!g.get(x, y + 1, z) && y > hc[1] - 1 && hash3(x, y, z, sd + 7) < 0.12) add.push([x, y + 1, z]); });
      for (const [x, y, z] of add) g.set(x, y, z, 'fuzz');
    }
  }
  carve(body, head);

  // animation: head nods with the heavy gait; trunk swings / sways / curls; ears flap; tail swishes
  const neck = pt(0, 16, 7);
  const nod = ({ t, agent, moving, phase }) => Math.sin(phase * 2) * 0.035 * moving + Math.sin(t * 0.45 + agent.s * 20) * 0.03 * (1 - moving);
  const headP = { name: 'head', role: 'static', grid: head, pivot: pitchPivot(neck), animate: (a) => ({ rx: nod(a) }) };
  const trunkParts = chainParts('trunk', trunk, joints, 'pitch', ({ t, agent, moving, phase }) => {
    const s = agent.s * 40, idle = 1 - moving;
    const curl = sst(0.35, 0.95, Math.sin(t * 0.33 + s)) * idle;
    const sway = Math.sin(t * 0.8 + s) * 0.12 * idle + Math.sin(phase) * 0.16 * moving;
    return [sway - curl * 0.35, -0.05 - curl * 0.35 + Math.sin(t * 1.3 + s) * 0.05, -0.1 - curl * 0.55, -0.15 - curl * 0.7];
  }, (a) => {
    const n = nod(a), v = [tj[0][1] - neck[1], tj[0][2] - neck[2]];
    return { ang: n, dy: v[0] * Math.cos(n) - v[1] * Math.sin(n) - v[0], dz: v[0] * Math.sin(n) + v[1] * Math.cos(n) - v[1] };
  });
  for (const e of ears) e.animate = ({ t, agent, moving }) => {
    const f = 0.12 + (0.2 + 0.45 * Math.max(0, Math.sin(t * 1.6 + agent.s * 30 + e.side * 0.4)) ** 3) * (1 - 0.6 * moving);
    return { ry: -e.side * f };
  };
  tailP.animate = ({ t, agent, moving }) => ({ rz: Math.sin(t * (1.6 + moving) + agent.s * 9) * 0.28, rx: 0.12 + 0.1 * moving });

  return rig([{ name: 'body', role: 'body', grid: body }, headP, ...trunkParts, ...ears, tailP, ...legs],
    { palette: P, scale: o.scale ?? (baby ? 0.36 : 0.5), speed: o.speed ?? (baby ? [1.1, 1.8] : [0.9, 1.4]), stride: (baby ? 8 : 11), idle: o.idle ?? [3, 9],
      anim: { legSwing: baby ? 0.4 : 0.28, bob: baby ? 0.3 : 0.35, ...(o.anim ?? {}) } });
}

// ---- shared quadruped bits ----------------------------------------------------------------------------

/** a w×d voxel column leg centred on (cx, cz) (cx/cz on voxel edges for even sizes), y 0..top; mat(x, y, z) */
function column(P, cx, cz, w, d, top, mat) {
  const g = new VoxelGrid(P);
  const x0 = Math.round(cx - w / 2), z0 = Math.round(cz - d / 2);
  for (let y = 0; y <= top; y++) for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) g.set(x, y, z, mat(x, y, z));
  return g;
}
/** four column legs: front pair at z = zf, back pair at z = zb, x = ±xo; returns parts (pivot at the hip, y = top) */
function fourLegs(P, { xo, zf, zb, w = 2, d = 2, top, hip = top, mat, matB = mat, wB = w, dB = d }) {
  const out = [];
  for (const [pair, z] of [[0, zf], [1, zb]]) for (const side of [-1, 1]) {
    const g = column(P, side * xo, z, pair ? wB : w, pair ? dB : d, top, pair ? matB : mat);
    out.push(legPart(`leg${pair ? 'B' : 'F'}${side < 0 ? 'L' : 'R'}`, g, side, pair, [side * xo, hip, z]));
  }
  return out;
}
/** blob = smooth union of ellipsoids [[c, r], …] (|x| mirrored) */
const blobs = (E, k = 1.2) => (x, y, z) => { x = Math.abs(x); let d = Infinity; for (const [c, r] of E) d = d === Infinity ? ell(x, y, z, c, r) : smin(d, ell(x, y, z, c, r), k); return d; };

// ---- tapir ---------------------------------------------------------------------------------------------

/**
 * Malayan tapir: black front half, head and legs, cream saddle over the back half, short drooping proboscis,
 * round white-rimmed ears. Browses (head dips) when idle. opts: seed, scale (0.5). ~4.6 world voxels tall, ~10 long.
 */
export function tapir(o = {}) { // o.baby: the 'watermelon' calf — chestnut with cream stripes and spots, smaller
  const baby = !!o.baby;
  const P = new Palette({
    black: baby ? { color: '#6b4a30', jitter: 0.04, noise: { color: '#5a3c26', scale: 0.4, amount: 0.5 } } : { color: '#242227', jitter: 0.04, noise: { color: '#2f2c33', scale: 0.4, amount: 0.6 } },
    cream: { color: baby ? '#efe3c8' : '#e6dfd1', jitter: 0.03, noise: { color: '#d5cbb8', scale: 0.4, amount: 0.15 } },
    snout: { color: '#3d383d', jitter: 0.04 },
    rim: { color: '#f3efe7', jitter: 0.02 },
    hoof: { color: '#151317', jitter: 0.02 },
    eye: { color: '#0a090b', roughness: 0.15 },
  });
  const saddle = (y, z) => y > 3.2 && z < -1 + (y - 5) * 0.3 && z > -7.5;          // ends behind the shoulders: a big black front
  // calf: horizontal cream stripes along the flanks and rows of spots on the back (deterministic per cell)
  const stripes = (x, y, z) => (Math.abs(x) > 1.5 ? (Math.floor(y) % 2 === 0 && Math.floor(z + y * 0.4) % 3 !== 0) : hash3(Math.floor(x), Math.floor(y), Math.floor(z), 21) < 0.3);
  const bodyFn = blobs([[[0, 5.6, -0.6], [3.3, 3.0, 6.4]], [[0, 6.1, -3.4], [3.3, 3.1, 3.9]], [[0, 5.3, 3.0], [3.0, 2.8, 3.4]]], 1.4);
  const body = sdfPart(P, [-5, 1, -9], [5, 10, 7], bodyFn, (x, y, z) => (baby ? (y > 3 && stripes(x, y, z) ? 'cream' : 'black') : saddle(y + 0.5, z + 0.5) ? 'cream' : 'black'));
  body.set(0, 6, -8, 'black'); body.set(-1, 6, -8, 'black');                     // stub tail
  const headFn = (x, y, z) => { const ax = Math.abs(x); return smin(smin(ell(ax, y, z, [0, 5.8, 7.0], [2.0, 2.3, 2.6]), cap(ax, y, z, [0, 6.2, 3.6], [0, 5.8, 6.6], 2.3, 2.0), 1.2), cap(ax, y, z, [0, 5.0, 8.6], [0, 3.4, 13.2], 1.45, 0.85), 1.2); };
  const head = sdfPart(P, [-3, 2, 3], [3, 9, 14], headFn, (x, y, z) => (z + 0.5 > 9.6 ? 'snout' : 'black'));
  carve(body, head);
  for (const side of [-1, 1]) {                                                   // round ears, white rims
    const ex = side < 0 ? -3 : 2;
    head.box([ex, 8, 5], [ex, 8, 6], 'black'); head.set(ex, 9, 5, 'black'); head.set(ex, 9, 6, 'rim'); head.set(ex, 10, 5, 'rim');
  }
  eyes(head, 6, 8);
  const legs = fourLegs(P, { xo: 2, zf: 4.5, zb: -4.5, top: 4, hip: 4.5, mat: (x, y) => (y === 0 ? 'hoof' : 'black') });
  for (const l of legs) carve(body, l.grid);
  return rig([{ name: 'body', role: 'body', grid: body }, { name: 'head', role: 'head', grid: head, pivot: [0, 6, 4.5] }, ...legs],
    { palette: P, scale: o.scale ?? (baby ? 0.3 : 0.5), speed: o.speed ?? [1, 1.8], stride: 6, idle: o.idle ?? [2, 7], sprint: 0.1,
      anim: { legSwing: 0.55, bob: 0.25, headNod: 0.06, graze: 0.35, ...(o.anim ?? {}) } });
}

// ---- sun bear ------------------------------------------------------------------------------------------

/**
 * Malayan sun bear: sleek black, short tan muzzle, yellow-orange crescent chest patch (from the front), small
 * round ears, long pale claws, waddling gait (body rolls, head swings). opts: seed, scale (0.5). ~3.5 tall at the back (5 to the ears), ~6.5 long.
 */
export function sunbear(o = {}) {
  const P = new Palette({
    fur: { color: '#201e22', jitter: 0.04, roughness: 0.6, noise: { color: '#2b282c', scale: 0.4, amount: 0.6 } },
    muzzle: { color: '#c49a68', jitter: 0.04 },
    chest: { color: '#eaa53a', jitter: 0.04 },
    claw: { color: '#bfb49c', jitter: 0.02 },
    nose: { color: '#0e0d0f', jitter: 0 },
    eye: { color: '#4a3324', roughness: 0.15 },
  });
  const bodyFn = blobs([[[0, 4.1, -0.6], [3.0, 2.8, 4.2]], [[0, 4.3, -2.4], [3.0, 2.8, 2.8]], [[0, 4.3, 2.0], [2.9, 2.8, 2.6]]], 1.2);
  const crescent = (x, y) => { const u = (x + 0.5) / 2.3, v = (y + 0.5 - 5.3) / 2.9, r = u * u + v * v; return y + 0.5 < 5.4 && r > 0.3 && r < 1.1; };
  const body = sdfPart(P, [-4, 1, -6], [4, 8, 5], bodyFn, (x, y, z) => (z + 0.5 > 2.6 && crescent(x, y) ? 'chest' : 'fur'));
  body.set(0, 5, -5, 'fur'); body.set(-1, 5, -5, 'fur');
  const headFn = (x, y, z) => { const ax = Math.abs(x); return smin(ell(ax, y, z, [0, 6.3, 5.0], [2.4, 2.1, 1.9]), ell(ax, y, z, [0, 5.6, 6.9], [1.25, 1.0, 1.25]), 0.8); };
  const head = sdfPart(P, [-3, 3, 2], [3, 9, 9], headFn, (x, y, z) => (z + 0.5 > 6.2 && y + 0.5 < 6.4 ? 'muzzle' : 'fur'));
  for (const x of [-1, 0]) { const z = frontZ(head, x, 6); if (z != null) head.set(x, 6, z, 'nose'); }
  for (const side of [-1, 1]) head.set(side < 0 ? -2 : 1, 9, 4, 'fur');            // small round ears
  eyes(head, 7, 6);
  carve(body, head);
  const legs = fourLegs(P, { xo: 2, zf: 2.5, zb: -3.5, top: 2, hip: 2.6, mat: () => 'fur' });
  for (const l of legs.slice(0, 2)) { const b = l.grid.bounds(); for (let x = b.min[0]; x <= b.max[0]; x++) l.grid.set(x, 0, b.max[2] + 1, 'claw'); }
  for (const l of legs) carve(body, l.grid);
  const roll = ({ moving, phase }) => Math.sin(phase) * 0.08 * moving;
  return rig([{ name: 'body', role: 'body', grid: body, pivot: [0, 0.5, 0], animate: (a) => ({ rz: roll(a) }) },
    { name: 'head', role: 'head', grid: head, pivot: [0, 5.5, 3.5], animate: (a) => ({ rx: a.rx, ry: a.ry + Math.sin(a.phase) * 0.12 * a.moving, rz: roll(a) }) }, ...legs],
  { palette: P, scale: o.scale ?? 0.5, speed: o.speed ?? [1.2, 2.2], stride: 3.6, idle: o.idle ?? [1.5, 5], sprint: 0.15,
    anim: { legSwing: 0.6, bob: 0.35, headNod: 0.1, graze: 0.25, ...(o.anim ?? {}) } });
}

// ---- wild boar -----------------------------------------------------------------------------------------

/**
 * Wild boar: bristly dark grey-brown, high shoulders with a mane ridge along the spine, long snout with a pink
 * disc and small tusks, thin legs, tufted tail; roots (head down) when idle. opts: baby (striped piglet: light
 * brown with cream stripes, ~2 world voxels tall — make them behavior 'follow' the sow), seed, scale.
 * Adult ~4.2 world voxels tall, ~8 long.
 */
export function boar(o = {}) {
  const baby = !!o.baby, sd = (o.seed ?? 1) * 19;
  const P = new Palette(baby ? {
    fur: { color: '#a8794a', jitter: 0.05 }, fur2: { color: '#7a5634', jitter: 0.05 }, stripe: { color: '#e8d29c', jitter: 0.03 },
    snout: { color: '#c08a7a', jitter: 0.03 }, hoof: { color: '#3a2a20' }, eye: { color: '#120e0c', roughness: 0.2 },
  } : {
    fur: { color: '#4d4239', jitter: 0.11, noise: { color: '#3b322b', scale: 0.5, amount: 0.7 } }, fur2: { color: '#2b2420', jitter: 0.08 },
    grizzle: { color: '#7b6b5a', jitter: 0.08 }, snout: { color: '#6a524c', jitter: 0.03 }, tusk: { color: '#efe6d2', jitter: 0.02 },
    hoof: { color: '#181412' }, eye: { color: '#0e0b0a', roughness: 0.2 },
  });
  const k = baby ? 0.62 : 1;
  const s3 = (v) => v.map((q) => q * k);
  if (baby) {
    const bodyFn = blobs([[s3([0, 4.8, -0.4]), s3([2.9, 2.7, 4.6])]], 1);
    const cy = 4.8 * k;
    const body = sdfPart(P, [-3, 0, -4], [3, 6, 4], bodyFn, (x, y, z) => {
      const a = Math.atan2(y + 0.5 - cy, Math.abs(x + 0.5));
      return y + 0.5 < cy - 1 ? 'fur' : Math.floor((a + 1.6) / 0.45) % 2 ? 'stripe' : 'fur';
    });
    const headFn = (x, y, z) => { const ax = Math.abs(x); return smin(ell(ax, y, z, s3([0, 5, 4.6]), s3([2.4, 2.4, 2.2])), cap(ax, y, z, s3([0, 4.6, 5.5]), s3([0, 4.0, 7.6]), 1.2, 0.9), 0.8); };
    const head = sdfPart(P, [-3, 0, 1], [3, 6, 6], headFn, (x, y, z) => (z + 0.5 > 5.2 * k + 1.6 ? 'snout' : 'fur'));
    for (const side of [-1, 1]) head.set(side < 0 ? -2 : 1, 5, 2, 'fur2');
    eyes(head, 3, 2);
    carve(body, head);
    const legs = fourLegs(P, { xo: 1, w: 1, d: 1, zf: 1.5, zb: -1.5, top: 1, hip: 1.5, mat: (x, y) => (y === 0 ? 'hoof' : 'fur2') });
    for (const l of legs) carve(body, l.grid);
    return rig([{ name: 'body', role: 'body', grid: body }, { name: 'head', role: 'head', grid: head, pivot: [0, 3, 2] }, ...legs],
      { palette: P, scale: o.scale ?? 0.42, speed: o.speed ?? [1.6, 2.8], stride: 3, idle: o.idle ?? [1, 3], sprint: 0.3,
        anim: { legSwing: 0.8, bob: 0.45, headNod: 0.1, graze: 0.5, ...(o.anim ?? {}) } });
  }
  const bodyFn = blobs([[[0, 4.9, -0.6], [2.8, 2.6, 5.2]], [[0, 5.5, 2.3], [3.0, 3.0, 3.4]], [[0, 4.7, -3.4], [2.6, 2.5, 2.8]]], 1.3);
  const body = sdfPart(P, [-4, 1, -7], [4, 9, 6], bodyFn, (x, y, z) => (y + 0.5 < 3.2 ? 'fur2' : hash3(x, y, z, sd) < 0.12 ? 'grizzle' : 'fur'));
  // mane: a ragged ridge of dark bristles along the spine, tallest over the shoulders
  for (let z = -3; z <= 5; z++) for (const x of [-1, 0]) {
    const y0 = body.top(x, z);
    if (y0 === -Infinity) continue;
    const h = z > 0 ? 2 : 1;
    for (let k2 = 1; k2 <= h; k2++) if (k2 === 1 || hash3(x, z, k2, sd + 1) < 0.6) body.set(x, y0 + k2, z, 'fur2');
  }
  body.line([0, 6, -6], [0, 3, -7], 'fur'); body.set(0, 2, -7, 'fur2'); body.set(-1, 2, -7, 'fur2');   // thin tail + tuft
  const headFn = (x, y, z) => { const ax = Math.abs(x); return smin(cap(ax, y, z, [0, 5.4, 4.6], [0, 4.0, 9.4], 2.4, 1.15), ell(ax, y, z, [0, 5.2, 5.4], [2.2, 2.4, 1.8]), 1); };
  const head = sdfPart(P, [-3, 2, 3], [3, 8, 11], headFn, (x, y, z) => (z + 0.5 > 9.9 ? 'snout' : y + 0.5 < 4 && z > 6 ? 'fur2' : hash3(x, y, z, sd + 2) < 0.1 ? 'grizzle' : 'fur'));
  for (const side of [-1, 1]) { const x = side < 0 ? -2 : 1; head.set(x, 7, 5, 'fur2'); head.set(x, 8, 5, 'fur2'); head.set(x, 7, 4, 'fur2'); }   // pointed ears
  for (const x of [-1, 0]) head.set(x, 7, 6, 'fur2');                                                                                  // mane starts on the crown
  for (const x of [-2, 1]) head.set(x, 4, 9, 'tusk');                                                                               // small tusks
  eyes(head, 5, 7);
  carve(body, head);
  const legs = fourLegs(P, { xo: 1.5, w: 1, d: 2, zf: 2.6, zb: -3.6, top: 3, hip: 3.5, mat: (x, y) => (y === 0 ? 'hoof' : 'fur2') });
  for (const l of legs) carve(body, l.grid);
  const tailG = new VoxelGrid(P);
  body.forEach((x, y, z) => { if (z <= -7 && y <= 6) tailG.set(x, y, z, body.get(x, y, z)); });
  tailG.forEach((x, y, z) => body.del(x, y, z));
  return rig([{ name: 'body', role: 'body', grid: body }, { name: 'head', role: 'head', grid: head, pivot: [0, 5, 4] }, ...legs,
    { name: 'tail', role: 'static', grid: tailG, pivot: [0.5, 6, -6], animate: ({ t, agent, moving }) => ({ rz: Math.sin(t * (3 + 3 * moving) + agent.s * 9) * 0.35 }) }],
  { palette: P, scale: o.scale ?? 0.5, speed: o.speed ?? [1.4, 2.4], stride: 4.5, idle: o.idle ?? [2, 7], sprint: 0.3,
    anim: { legSwing: 0.7, bob: 0.3, headNod: 0.08, graze: 0.8, ...(o.anim ?? {}) } });
}

// ---- muntjac -------------------------------------------------------------------------------------------

/**
 * Muntjac (barking deer): small, reddish-brown, slender legs, dark face stripes, short antlers on the male,
 * white tail flag that flips up when it runs; skittish (sprints often). opts: male (default by seed), seed,
 * scale (0.5). ~3 world voxels at the shoulder, ~4 to the ears.
 */
export function muntjac(o = {}) {
  const R = rng(o.seed ?? 1), male = o.male ?? R.chance(0.5);
  const P = new Palette({
    fur: { color: '#a8552b', jitter: 0.05, noise: { color: '#934722', scale: 0.4, amount: 0.5 } },
    back: { color: '#7d3c1d', jitter: 0.04 },
    belly: { color: '#eadcc6', jitter: 0.03 },
    leg: { color: '#5c3a25', jitter: 0.04 },
    stripe: { color: '#3a2418', jitter: 0.03 },
    antler: { color: '#cdb98c', jitter: 0.03 },
    white: { color: '#f4f0e8', jitter: 0.02 },
    nose: { color: '#2a1d17' },
    eye: { color: '#0f0b0a', roughness: 0.15 },
  });
  const bodyFn = blobs([[[0, 4.3, -0.3], [1.8, 1.5, 3.4]], [[0, 4.5, -1.8], [1.85, 1.6, 2.1]]], 1);
  const body = sdfPart(P, [-3, 2, -4], [3, 7, 4], bodyFn, (x, y, z) => (y + 0.5 < 3.5 ? 'belly' : y >= 5 ? 'back' : 'fur'));
  const headFn = (x, y, z) => { const ax = Math.abs(x); let d = cap(ax, y, z, [0, 4.8, 2.2], [0, 6.4, 3.9], 1.05, 0.9); d = smin(d, ell(ax, y, z, [0, 6.6, 4.4], [1.6, 1.1, 1.4]), 0.6); return smin(d, cap(ax, y, z, [0, 6.4, 5.1], [0, 5.9, 6.5], 0.9, 0.6), 0.5); };
  const head = sdfPart(P, [-2, 3, 1], [2, 8, 7], headFn, (x, y, z) => (y + 0.5 < 5.6 && z + 0.5 < 3.6 ? 'belly' : 'fur'));
  for (const x of [-1, 0]) { const z = frontZ(head, x, 5); if (z != null) head.set(x, 5, z, 'nose'); }
  for (const x of [-1, 0]) head.set(x, 7, 4, 'stripe');
  for (const side of [-1, 1]) { const x = side < 0 ? -3 : 2; head.set(x, 7, 3, 'fur'); head.set(x, 8, 3, 'back'); }                         // ears
  if (male) for (const x of [-2, 1]) { head.set(x, 8, 4, 'back'); head.set(x, 9, 4, 'antler'); head.set(x, 10, 3, 'antler'); }               // short antlers on pedicles
  eyes(head, 7, 5);
  carve(body, head);
  const legs = fourLegs(P, { xo: 1.5, w: 1, d: 1, zf: 2.5, zb: -2.5, top: 3, hip: 3.6, mat: (x, y) => (y === 0 ? 'nose' : y === 3 ? 'fur' : 'leg') });
  for (const l of legs) carve(body, l.grid);
  const tail = new VoxelGrid(P);
  tail.box([-1, 5, -5], [0, 5, -4], 'fur'); tail.box([-1, 4, -5], [0, 4, -5], 'white');
  return rig([{ name: 'body', role: 'body', grid: body }, { name: 'head', role: 'head', grid: head, pivot: [0, 5, 2.5] }, ...legs,
    { name: 'tail', role: 'static', grid: tail, pivot: [0, 5.5, -4], animate: ({ t, agent, moving }) => {
      const run = Math.max(0, Math.min(1, (agent.speed / Math.max(agent.baseSpeed, 0.01) - 1.1) * 2));
      return { rx: -(0.15 + 0.35 * moving + 1.1 * run) + Math.sin(t * 7 + agent.s * 9) * 0.08 * (1 - run) };
    } }],
  { palette: P, scale: o.scale ?? 0.5, speed: o.speed ?? [2.2, 3.4], stride: 5.5, idle: o.idle ?? [1, 4], sprint: 0.55,
    anim: { legSwing: 0.75, bob: 0.3, headNod: 0.1, graze: 0.55, ...(o.anim ?? {}) } });
}

// ---- tiger ---------------------------------------------------------------------------------------------

/**
 * Indochinese tiger: orange with bold black stripes, white belly, muzzle, cheek ruffs and eye spots, black-backed
 * ears, a long striped tail that sways in an S (3-segment chain); prowls slowly with long pauses.
 * opts: seed, scale (0.5). ~4.3 world voxels at the shoulder (5.5 to the ears), ~10 long (+5 tail).
 */
export function tiger(o = {}) {
  const sd = (o.seed ?? 1) * 23;
  const P = new Palette({
    orange: { color: '#dc7726', jitter: 0.04, noise: { color: '#cb6619', scale: 0.4, amount: 0.5 } },
    orange2: { color: '#e99a4c', jitter: 0.04 },
    stripe: { color: '#1d1714', jitter: 0.03 },
    white: { color: '#f1ebe0', jitter: 0.03 },
    nose: { color: '#d48a80', jitter: 0 },
    eye: { color: '#1c140c', roughness: 0.15 },
  });
  // stripes: narrow vertical bands with wobble, not reaching the belly; each band has its own length
  const band = (x, y, z) => {
    const u = z * 0.42 + 0.22 * Math.sin(y * 1.1 + Math.abs(x) * 0.5) + 0.15 * Math.sin(z * 0.7);
    const i = Math.floor(u), f = u - i;
    return f < 0.24 && y + 0.5 > 4.6 + hash3(i, 7, 3, sd) * 1.6;
  };
  const bodyFn = blobs([[[0, 5.8, -0.6], [3.0, 2.6, 7.2]], [[0, 5.9, 3.8], [3.2, 2.9, 3.4]], [[0, 6.0, -5.0], [3.0, 2.7, 3.0]]], 1.4);
  const body = sdfPart(P, [-4, 2, -9], [4, 10, 8], bodyFn, (x, y, z) => (y + 0.5 < 4.4 ? 'white' : band(x, y, z) ? 'stripe' : y + 0.5 < 5.2 ? 'orange2' : 'orange'));
  const headFn = (x, y, z) => {
    const ax = Math.abs(x);
    let d = ell(ax, y, z, [0, 7.0, 8.8], [2.6, 2.3, 2.2]);
    d = smin(d, ell(ax, y, z, [1.7, 5.9, 8.7], [1.3, 1.4, 1.4]), 0.8);       // cheek ruffs
    return smin(d, ell(ax, y, z, [0, 6.0, 10.5], [1.5, 1.1, 1.2]), 0.8);     // muzzle
  };
  const head = sdfPart(P, [-4, 4, 6], [4, 10, 12], headFn, (x, y, z) => {
    const ax = Math.abs(x + 0.5);
    if (y + 0.5 < 6.6 && (z + 0.5 > 9.6 || ax > 1.6)) return 'white';
    if (y >= 8 && z <= 9 && (x === -1 || x === 0 ? z % 2 === 0 : (z + y) % 3 === 0)) return 'stripe';
    if (ax > 2.0 && y === 7 && z <= 8) return 'stripe';
    return 'orange';
  });
  for (const x of [-1, 0]) { const z = frontZ(head, x, 6); if (z != null) head.set(x, 6, z, 'nose'); }
  for (const side of [-1, 1]) {                                                       // round ears, black backs with a white spot
    const x = side < 0 ? -3 : 2;
    head.box([x, 9, 7], [x, 9, 8], 'stripe'); head.set(x, 10, 7, 'stripe'); head.set(x, 9, 8, 'white');
  }
  const ey = 7, ez = frontZ(head, 1, 7) ?? 10;
  for (const x of [-2, 1]) { head.set(x, ey, ez, 'eye'); head.set(x, ey + 1, ez, 'white'); }
  carve(body, head);
  const legMat = (x, y, z) => (y === 0 ? 'white' : (y === 2 && Math.abs(x + 0.5) > 1.6) ? 'stripe' : 'orange');
  const legs = fourLegs(P, { xo: 2, zf: 4.5, zb: -5, top: 4, hip: 4.5, mat: legMat });
  for (const l of legs) { if (l.pair === 0) { const b = l.grid.bounds(); for (let x = b.min[0]; x <= b.max[0]; x++) l.grid.set(x, 0, b.max[2] + 1, 'white'); } carve(body, l.grid); }
  // tail: 3-segment yaw chain, striped, black tip
  const tp = [[0, 7.2, -7.6], [0, 5.6, -10], [0, 4.6, -12.8], [0, 5.0, -15.2], [0, 6.2, -16.8]];
  const tseg = tubeSegments(P, tp, () => 0.95, (x, y, z, s) => (s > 0.86 || Math.floor(s * 11) % 2 === 1 ? 'stripe' : 'orange'), (x, y, z) => body.get(x, y, z));
  tseg[2].stamp(tseg.pop());
  const tail = chainParts('tail', tseg, [tp[0], tp[1], tp[2], tp[4]], 'yaw', ({ t, agent, moving }) => {
    const w = t * (1.1 + 0.6 * moving) + agent.s * 30, a = 0.22 + 0.12 * (1 - moving);
    return [Math.sin(w) * a, Math.sin(w - 1.1) * a * 1.2, Math.sin(w - 2.2) * a * 1.4];
  });
  return rig([{ name: 'body', role: 'body', grid: body }, { name: 'head', role: 'head', grid: head, pivot: [0, 7, 6.5] }, ...legs, ...tail],
    { palette: P, scale: o.scale ?? 0.5, speed: o.speed ?? [0.8, 1.3], stride: 8, idle: o.idle ?? [5, 14], sprint: 0.05,
      anim: { legSwing: 0.5, bob: 0.12, headNod: 0.05, graze: 0.1, ...(o.anim ?? {}) } });
}

// ---- macaque -------------------------------------------------------------------------------------------

/**
 * Macaque: grey-brown, pinkish face, tail up; quick, and sits up on its haunches whenever it stops (the body
 * tilts about its middle so the rump drops and the chest rises). opts: kind ('longtail' | 'pigtail'; default by
 * seed), baby (juvenile, smaller — behavior 'follow' a mother), seed, scale (0.5). ~2.6 world voxels tall.
 */
export function macaque(o = {}) {
  const R = rng(o.seed ?? 1), kind = o.kind ?? (R.chance(0.6) ? 'longtail' : 'pigtail'), pig = kind === 'pigtail';
  const P = new Palette({
    fur: { color: pig ? '#857560' : '#8e7f69', jitter: 0.05, noise: { color: pig ? '#6f604c' : '#7a6b56', scale: 0.5, amount: 0.5 } },
    light: { color: pig ? '#b9a88c' : '#b8ab94', jitter: 0.04 },
    dark: { color: '#5a4c3e', jitter: 0.04 },
    face: { color: '#bd8b7e', jitter: 0.03 },
    hand: { color: '#4e4238', jitter: 0.03 },
    eye: { color: '#1a110e', roughness: 0.2 },
  });
  const bodyFn = (x, y, z) => {
    const ax = Math.abs(x);
    let d = smin(ell(ax, y, z, [0, 3.2, -0.3], [1.7, 1.4, 2.4]), ell(ax, y, z, [0, 3.6, 1.4], [1.7, 1.5, 1.4]), 0.8);
    d = smin(d, ell(ax, y, z, [0, 4.8, 3.0], [1.75, 1.6, 1.5]), 0.6);                        // head
    return smin(d, ell(ax, y, z, [0, 4.1, 4.1], [0.95, 0.75, 0.7]), 0.4);                     // muzzle
  };
  const body = sdfPart(P, [-3, 1, -3], [3, 7, 6], bodyFn, (x, y, z) => {
    if (z >= 2 && y + 0.5 < 3.6) return 'light';
    if (y >= 6 && pig) return 'dark';                                                         // pig-tailed: dark cap
    return y + 0.5 < 2.4 ? 'light' : 'fur';
  });
  for (let y = 3; y <= 5; y++) for (let x = -1; x <= 0; x++) { const z = frontZ(body, x, y); if (z != null && z >= 3) body.set(x, y, z, 'face'); }
  for (const x of [-2, 1]) { const z = frontZ(body, x, 5); if (z != null) body.set(x, 5, z, 'eye'); }
  for (const x of [-1, 0]) { const z = frontZ(body, x, 6); if (z != null) body.set(x, 6, z, pig ? 'dark' : 'fur'); }      // brow
  for (const side of [-1, 1]) body.set(side < 0 ? -3 : 2, 5, 2, 'light');                                                // ears
  const tpts = pig ? [[0, 3.8, -2.2], [0, 5.0, -3.0], [0, 6.0, -2.4], [0, 6.2, -1.6]] : [[0, 3.6, -2.2], [0, 4.6, -3.5], [0, 5.4, -5.0], [0, 5.4, -6.6], [0, 4.6, -8.0]];
  const tg = new VoxelGrid(P);
  for (const g2 of tubeSegments(P, tpts.map(([x, y, z]) => [x - 0.5, y, z]), () => 0.62, (x, y, z, sv) => (pig || sv > 0.75 ? 'dark' : 'fur'))) tg.stamp(g2);
  carve(tg, body);
  // sitting: everything above the legs tilts about the body's middle
  const pv = [0, 2.8, -0.3], sit = (m) => (1 - m) * (1 - m);
  const arms = fourLegs(P, { xo: 1.5, w: 1, d: 1, zf: 1.5, zb: -1.5, top: 3, hip: 2.4, mat: (x, y) => (y === 0 ? 'hand' : 'fur'), dB: 2 });
  arms[2].grid.clear(); arms[3].grid.clear();
  for (const [i, x] of [[2, -2], [3, 1]]) { arms[i].grid.box([x, 0, -2], [x, 1, -1], 'fur'); arms[i].grid.set(x, 0, -1, 'hand'); arms[i].pivot = [x + 0.5, 2, -1.5]; }
  for (const l of arms) carve(body, l.grid);
  const baby = !!o.baby;
  return rig([{ name: 'body', role: 'body', grid: body, pivot: pv, animate: ({ moving }) => ({ rx: -0.55 * sit(moving) }) },
    { name: 'tail', role: 'static', grid: tg, pivot: pv, animate: ({ t, agent, moving }) => ({ rx: -0.55 * sit(moving) + Math.sin(t * 2 + agent.s * 9) * 0.06, rz: Math.sin(t * 1.3 + agent.s * 7) * 0.08 }) },
    ...arms],
  { palette: P, scale: o.scale ?? (baby ? 0.32 : 0.5), speed: o.speed ?? [2.2, 3.6], stride: 3.6, idle: o.idle ?? [3, 10], sprint: 0.35,
    anim: { legSwing: 0.5, bob: 0.4, ...(o.anim ?? {}) } });
}

// ---- monitor lizard ------------------------------------------------------------------------------------

/**
 * Water monitor: long, low, dark olive with bands of yellow speckles, splayed legs sweeping in a sprawling
 * trot, the whole body swinging in a travelling S that grows toward the long tail, forked tongue flicking.
 * opts: seed, scale (0.5). ~1.6 world voxels tall, ~9.5 long.
 */
export function monitor(o = {}) {
  const sd = (o.seed ?? 1) * 29;
  const P = new Palette({
    skin: { color: '#4b5036', jitter: 0.06, noise: { color: '#3d412b', scale: 0.5, amount: 0.6 } },
    dark: { color: '#2c2e21', jitter: 0.04 },
    spot: { color: '#b9a64a', jitter: 0.06 },
    belly: { color: '#8c8659', jitter: 0.04 },
    tongue: { color: '#d55a7c', jitter: 0.02 },
    claw: { color: '#1a1a14' },
    eye: { color: '#0d0d09', roughness: 0.15 },
  });
  const zt = -11.5, zh = 7.5;
  // half-width / half-height / spine height along z
  const prof = (z) => {
    if (z > 4) { const t = (z - 4) / (zh - 4); return [1.72 - 0.85 * t * t, 1.0 - 0.35 * t, 2.0 - 0.25 * t]; }   // head
    if (z > 2.5) return [1.35, 0.95, 2.0];                                                             // neck
    if (z > -2.5) { const t = 1 - Math.abs(z) / 2.5; return [1.9 + 0.55 * t, 1.15 + 0.15 * t, 2.0]; } // body
    const t = (z + 2.5) / (zt + 2.5); return [1.75 - 1.3 * t, 1.0 - 0.5 * t, 1.95 - 0.7 * t];         // tail
  };
  const inside = (x, y, z) => { if (z < zt || z > zh) return false; const [w, h, yc] = prof(z); return (x / w) ** 2 + ((y - yc) / h) ** 2 <= 1; };
  const cuts = [zh + 1, 4, 2.5, 0, -2.5, -4.8, -7.1, -9.3, zt - 1];                                        // segment z ranges (head first)
  const segs = cuts.slice(1).map(() => new VoxelGrid(P));
  for (let z = Math.floor(zt); z <= zh; z++) for (let y = 0; y <= 4; y++) for (let x = -4; x <= 3; x++) {
    const cz = z + 0.5;
    if (!inside(x + 0.5, y + 0.5, cz)) continue;
    const i = cuts.findIndex((c, j) => j > 0 && cz >= c) - 1;
    const top = !inside(x + 0.5, y + 1.5, cz), [w] = prof(cz);
    let m = y === 0 || (y === 1 && !inside(x + 0.5, y - 0.5, cz)) ? 'belly' : 'skin';
    if (top && cz < 4.5 && cz > zt + 1.5 && Math.floor(cz) % 3 === 0 && hash3(x, y, z, sd) < 0.5) m = 'spot';
    else if (top && cz < -3 && Math.floor(cz) % 3 === 1) m = 'dark';
    else if (!top && Math.abs(x + 0.5) > w - 0.9 && cz < 2.5 && cz > -2.5 && hash3(x, y, z, sd + 1) < 0.25) m = 'spot';
    segs[i].set(x, y, z, m);
  }
  eyes(segs[0], 2, 5);
  // travelling wave: amplitude grows toward the tail tip; idle: slow swish of the tail
  const lam = 9, amp = (z) => 0.22 + 1.5 * sst(-2, zt, z);
  const wave = (z, a) => {
    const w = (2 * Math.PI * z) / lam + a.phase;
    const idle = (1 - a.moving) * 0.9 * sst(-3, zt, z) * Math.sin(a.t * 0.9 + a.agent.s * 20 + z * 0.25);
    return [amp(z) * Math.sin(w) + idle, (amp(z) * Math.cos(w) * 2 * Math.PI) / lam];
  };
  const parts = segs.map((g, i) => {
    const zc = (Math.max(cuts[i + 1], zt) + Math.min(cuts[i], zh)) / 2, yc = prof(zc)[2];   // head: same reference as the tongue
    return { name: i ? `seg${i}` : 'head', role: 'static', grid: g, pivot: yawPivot([0, yc, zc]), animate: (a) => { const [X, dX] = wave(zc, a); return slideYaw(X, 0, Math.atan(dX)); } };
  });
  // tongue: rests inside the head, flicks out along its direction
  const hz = (Math.min(cuts[0], zh) + cuts[1]) / 2, hy = prof(hz)[2];
  const tg = tongueIn(P, segs[0], 1, 4);
  parts.push({ name: 'tongue', role: 'static', grid: tg.grid, pivot: yawPivot([0, hy, hz]), animate: (a) => {
    const [X, dX] = wave(hz, a), yaw = Math.atan(dX), d = tg.reach * flick(a.t, a.agent.s);
    return slideYaw(X + d * Math.sin(yaw), d * Math.cos(yaw), yaw);
  } });
  // splayed legs sweeping about vertical axes at the shoulders/hips (diagonal pairs together)
  for (const [pair, z] of [[0, 2.2], [1, -2.6]]) for (const side of [-1, 1]) {
    const g = new VoxelGrid(P), x0 = side < 0 ? -3 : 2;
    g.box([x0, 1, z - 0.5], [x0 + side, 1, z - 0.5], 'skin'); g.set(x0 + side, 0, z - 0.5, 'skin');
    g.set(x0 + side, 0, z + 0.5, 'claw'); g.set(x0 + side * 2, 0, z - 0.5, 'claw');
    parts.push({ name: `leg${pair ? 'B' : 'F'}${side < 0 ? 'L' : 'R'}`, role: 'leg', side, pair, grid: g, pivot: [side < 0 ? -2 : 2, 1.5, z],
      animate: ({ moving, phase }) => ({ rx: 0, ry: -side * Math.sin(phase + (pair ^ (side > 0) ? Math.PI : 0)) * 0.55 * moving, rz: side * Math.max(0, Math.cos(phase + (pair ^ (side > 0) ? Math.PI : 0))) * 0.25 * moving }) });
  }
  return rig(parts, { palette: P, scale: o.scale ?? 0.5, speed: o.speed ?? [0.9, 1.6], stride: lam, idle: o.idle ?? [3, 9], sprint: 0.15, anim: { bob: 0.05, ...(o.anim ?? {}) } });
}

// ---- otter ---------------------------------------------------------------------------------------------

/**
 * Smooth-coated otter: sleek brown, pale throat, flat head, long thick tapering tail that undulates while it
 * swims at the water surface (only head and back show). Water creature: stage.actors({ on: 'water' }); families
 * follow each other (behavior 'follow'). opts: baby (pup, smaller), seed, scale (0.45). ~7 world voxels long.
 */
export function otter(o = {}) { // o: baby, fur (coat colour, e.g. '#4a2e1c' dark chocolate), seed, scale
  const baby = !!o.baby, fur = o.fur ?? '#5f4331';
  const P = new Palette({
    fur: { color: fur, jitter: 0.04, roughness: 0.45, noise: { color: o.fur ? shade(fur, -0.06) : '#4f3627', scale: 0.5, amount: 0.5 } },
    throat: { color: '#cbb592', jitter: 0.03 },
    nose: { color: '#17110f' },
    eye: { color: '#0b0908', roughness: 0.1 },
  });
  const bodyFn = blobs([[[0, 2.4, -0.6], [1.9, 1.5, 3.8]], [[0, 2.7, 2.2], [1.8, 1.5, 1.9]]], 1);
  const body = sdfPart(P, [-3, 0, -5], [3, 5, 5], bodyFn, (x, y, z) => (z + 0.5 > 2 && y + 0.5 < 2.4 ? 'throat' : 'fur'));
  const headFn = (x, y, z) => { const ax = Math.abs(x); return smin(ell(ax, y, z, [0, 3.8, 5.0], [1.7, 1.35, 1.6]), ell(ax, y, z, [0, 3.3, 6.4], [1.15, 0.85, 0.85]), 0.6); };
  const head = sdfPart(P, [-2, 1, 3], [2, 6, 8], headFn, (x, y, z) => (y + 0.5 < 3.8 && (z + 0.5 > 5.6 || Math.abs(x + 0.5) > 1) ? 'throat' : 'fur'));
  for (const x of [-1, 0]) { const z = frontZ(head, x, 4); if (z != null) head.set(x, 4, z, 'nose'); }
  eyes(head, 4, 6);
  carve(body, head);
  const tp = [[0, 2.4, -4.0], [0, 2.1, -6.6], [0, 1.8, -9.4]];
  const tseg = tubeSegments(P, tp, (s) => 1.35 - 0.85 * s, () => 'fur', (x, y, z) => body.get(x, y, z), 1);
  const tail = chainParts('tail', tseg, tp, 'pitch', ({ t, agent, moving }) => {
    const w = t * (2 + 2 * moving) + agent.s * 20, a = 0.08 + 0.14 * moving;
    return [Math.sin(w) * a, Math.sin(w - 1.2) * a * 1.4];
  });
  const legs = fourLegs(P, { xo: 1.5, w: 1, d: 1, zf: 2.5, zb: -2.5, top: 1, hip: 1.5, mat: () => 'fur', dB: 2 });
  for (const l of legs) carve(body, l.grid);
  return rig([{ name: 'body', role: 'body', grid: body }, { name: 'head', role: 'head', grid: head, pivot: [0, 3.4, 3.5] }, ...tail, ...legs],
    { palette: P, swim: true, lift: -2.5, scale: o.scale ?? (baby ? 0.3 : 0.45), speed: o.speed ?? [1.2, 2.2], stride: 4, idle: o.idle ?? [1, 4], sprint: 0.3,
      anim: { legSwing: 0.9, bob: 0.1, headNod: 0.12, ...(o.anim ?? {}) } });
}

// ---- snakes --------------------------------------------------------------------------------------------

const SNAKES = {
  python: { L: 28, r: 1.55, head: 3.4, hw: 1.8, lam: 16, A: 1.5, speed: [0.6, 1.0], idle: [6, 16] },
  cobra: { L: 24, r: 1.15, head: 3, hw: 1.85, lam: 16, A: 1.0, speed: [1.2, 2.0], idle: [3, 9], hood: true },
  viper: { L: 15, r: 1.05, head: 3, hw: 1.8, lam: 10, A: 0.7, speed: [0.6, 1.0], idle: [6, 14] },
};
/**
 * Snake: a chain of 2-voxel segments slithering in a travelling sine wave that stays put on the ground as it
 * moves (wavelength = stride), tongue flicking. opts: kind 'python' (reticulated: tan with a dark net,
 * thick, ~14 world voxels long) | 'cobra' (king cobra: olive-brown with pale bands, travels with its head
 * raised and rears up with its hood when it stops, ~12 long) | 'viper' (green pit viper: small, bright green,
 * ~7.5 long); seed, scale (0.5).
 */
export function snake(o = {}) {
  const R = rng(o.seed ?? 1), kind = SNAKES[o.kind] ? o.kind : R.pick(['python', 'cobra', 'viper']), S = SNAKES[kind], sd = (o.seed ?? 1) * 31;
  const P = new Palette({
    python: { base: { color: '#b39a62', jitter: 0.05 }, net: { color: '#3b2f22', jitter: 0.04 }, pale: { color: '#dcca90', jitter: 0.04 }, belly: { color: '#e2d8b4', jitter: 0.03 }, tongue: { color: '#9a3442' } },
    cobra: { base: { color: '#5a5333', jitter: 0.05, noise: { color: '#4a4329', scale: 0.4, amount: 0.5 } }, net: { color: '#3a3520', jitter: 0.04 }, pale: { color: '#cdc28a', jitter: 0.04 }, belly: { color: '#dccd92', jitter: 0.03 }, tongue: { color: '#8a2a36' } },
    viper: { base: { color: '#4fbd3c', jitter: 0.06, noise: { color: '#3fa632', scale: 0.4, amount: 0.5 } }, net: { color: '#2f8a2c', jitter: 0.04 }, pale: { color: '#e9ec9a', jitter: 0.03 }, belly: { color: '#a8de70', jitter: 0.03 }, tongue: { color: '#c23a3a' }, rust: { color: '#b8502a', jitter: 0.04 } },
  }[kind]);
  P.add('eye', { color: '#0d0c0a', roughness: 0.15 });
  const { L, r, head: HL, hw } = S, seg = 2;
  // cross-section half-width / half-height along z (tail tip z = 0 … snout z = L)
  const prof = (z) => {
    const tail = 0.25 + 0.75 * sst(0, L * 0.38, z);
    if (z > L - HL) { const t = (z - (L - HL)) / HL; return [hw * (1 - 0.35 * t * t), hw * 0.62 * (1 - 0.3 * t)]; }
    let w = r * tail * (z > L - HL - 1.5 ? 0.85 : 1);
    if (S.hood) w *= 1 + 1.3 * Math.exp(-(((z - (L - HL - 3)) / 2.4) ** 2));
    return [Math.max(0.55, w), Math.max(0.5, r * tail * 0.8)];
  };
  const pattern = (x, y, z, top, side) => {
    const ax = Math.abs(x + 0.5), cz = z + 0.5;
    if (y === 0 && !top) return 'belly';
    if (kind === 'python') {
      const a = (cz + ax * 1.1 + y * 0.6) / 4.6, b = (cz - ax * 1.1 - y * 0.6) / 4.6;
      const fa = a - Math.floor(a), fb = b - Math.floor(b);
      if (cz > L - HL) return top && ax < 0.6 ? 'net' : 'base';
      return fa < 0.2 || fb < 0.2 ? 'net' : fa > 0.4 && fa < 0.8 && fb > 0.4 && fb < 0.8 && top ? 'pale' : 'base';
    }
    if (kind === 'cobra') {
      if (cz > L - HL) return y === 0 ? 'pale' : 'base';
      if (cz > L - HL - 6.5) return y === 0 ? (ax > 1.6 ? 'base' : (ax > 0.6 && cz < L - HL - 2 && cz > L - HL - 5) ? 'net' : 'pale') : (ax < 1 && Math.floor(cz) === Math.floor(L - HL - 3.5) ? 'pale' : 'base');
      const u = (cz + ax * 0.7) / 4.2;
      return u - Math.floor(u) < 0.2 && cz < L - HL - 4 ? 'pale' : 'base';
    }
    if (cz < 2.5) return 'rust';
    if (cz > L - HL) return y === 0 && side ? 'pale' : 'base';
    if (y === 0) return 'belly';
    return top && hash3(x, y, z, sd) < 0.12 ? 'net' : 'base';
  };
  const n = 1 + Math.ceil((L - HL) / seg);
  const segs = Array.from({ length: n }, () => new VoxelGrid(P));
  const segOf = (cz) => (cz > L - HL ? 0 : Math.min(n - 1, 1 + Math.floor((L - HL - cz) / seg)));
  for (let z = 0; z < L; z++) {
    const cz = z + 0.5, [w, h] = prof(cz), yc = h;
    for (let y = 0; y <= Math.ceil(2 * h); y++) for (let x = -Math.ceil(w) - 1; x <= Math.ceil(w); x++) {
      const inside = (xx, yy) => ((xx + 0.5) / w) ** 2 + ((yy + 0.5 - yc) / h) ** 2 <= 1;
      if (!inside(x, y)) continue;
      segs[segOf(cz)].set(x, y, z, pattern(x, y, z, !inside(x, y + 1), !inside(x - 1, y) || !inside(x + 1, y)));
    }
  }
  { // eyes on the head sides, a little behind the snout
    const ez = Math.floor(L - HL * 0.45), ey = Math.max(0, Math.round(prof(ez + 0.5)[1] * 1.2) - 1);
    eyes(segs[0], ey, ez);
  }
  const zc = (i) => (i === 0 ? L - HL / 2 : L - HL - (i - 0.5) * seg), yref = (i) => prof(zc(i))[1];
  // slither: lateral offset X(z) and heading along the curve; the head end steadies a little
  // cobra: segments in front of the hinge rear up (pitch slides): a curve from the hinge turning up to vertical, head level on top
  const hinge = S.hood ? L - HL - 9 : -Infinity;
  const amp = (z) => S.A * (1 - 0.35 * sst(L - HL - 4, L, z)) * (S.hood ? 1 - sst(hinge - 6, hinge, z) : 1);
  const wave = (z, a) => { const w = (2 * Math.PI * z) / S.lam + a.phase; return [amp(z) * Math.sin(w), (amp(z) * Math.cos(w) * 2 * Math.PI) / S.lam]; };
  const rear = (a) => 0.16 + 0.84 * sst(0.1, 0.9, 1 - a.moving) * (0.85 + 0.15 * Math.sin(a.t * 0.8 + a.agent.s * 9));
  const rearPose = (z, rho) => {           // → [dy, dz, pitch] for the rest point (0, yc, z)
    const s = z - hinge, turn = 3.5, phiMax = rho * Math.PI * 0.5;
    if (z > L - HL) {                      // head: level, on top of the neck
      const [dy, dz] = rearPose(L - HL - 0.01, rho);
      return [dy + 0.6 * rho, dz, 0];
    }
    const phiAt = (u) => (Math.min(u, turn) / turn) * phiMax;
    let y = 0, zz = 0;
    const N = 12;
    for (let k2 = 0; k2 < N; k2++) { const u = ((k2 + 0.5) / N) * s, f = phiAt(u); y += (Math.sin(f) * s) / N; zz += (Math.cos(f) * s) / N; }
    return [y, zz - s, -phiAt(s)];
  };
  const parts = segs.map((g, i) => {
    const c = [0, yref(i), zc(i)], front = !!S.hood && c[2] > hinge;
    return { name: i ? `seg${i}` : 'head', role: 'static', grid: g, pivot: front ? pitchPivot(c) : yawPivot(c),
      animate: front ? (a) => { const [dy, dz, p] = rearPose(c[2], rear(a)); return slidePitch(dy, dz, p); }
        : (a) => { const [X, dX] = wave(c[2], a); return slideYaw(X, 0, Math.atan(dX)); } };
  });
  // forked tongue: rests inside the head, flicks out of the snout (moves with the head)
  const tg = tongueIn(P, segs[0], 0, Math.ceil(L - HL));
  const h0 = [0, yref(0), zc(0)];
  parts.push({ name: 'tongue', role: 'static', grid: tg.grid, pivot: hinge > -Infinity ? pitchPivot(h0) : yawPivot(h0), animate: (a) => {
    const d = tg.reach * flick(a.t, a.agent.s);
    if (hinge > -Infinity) { const [dy, dz, p] = rearPose(h0[2], rear(a)); return slidePitch(dy - d * Math.sin(p), dz + d * Math.cos(p), p); }
    const [X, dX] = wave(h0[2], a), yaw = Math.atan(dX);
    return slideYaw(X + d * Math.sin(yaw), d * Math.cos(yaw), yaw);
  } });
  return rig(parts, { palette: P, scale: o.scale ?? 0.5, speed: o.speed ?? S.speed, stride: S.lam, idle: o.idle ?? S.idle, sprint: 0.05, anim: { bob: 0, ...(o.anim ?? {}) } });
}

// ---- registry -------------------------------------------------------------------------------------------

const W_ = (name, fn, summary, example, habitat = 'ground') => defineCreature(name, fn, { summary, habitat, example });
W_('elephant', elephant, 'Asian elephant (Khao Sok): curling trunk, flapping ears; { baby: true } calf, { tusks: true } bull; slow heavy gait',
  (stage, { area }) => {
    const mum = stage.actors({ creature: 'elephant', area, seed: 2, options: { tusks: false } });
    return stage.actors({ creature: 'elephant', options: { baby: true }, behavior: 'follow', target: mum, spacing: 9, area, seed: 3 });
  });
W_('tapir', tapir, 'Malayan tapir: black with a cream saddle, short proboscis, white-rimmed ears; browses when idle; { baby: true } = striped calf',
  (stage, { area }) => { stage.actors({ id: 'catalog_tapir', creature: 'tapir', count: 1, area, seed: 2 }); stage.actors({ creature: 'tapir', options: { baby: true }, behavior: 'follow', target: 'catalog_tapir', count: 1, area }); });
W_('sunbear', sunbear, 'Malayan sun bear: sleek black, tan muzzle, orange chest crescent, long claws; waddles',
  (stage, { area }) => stage.actors({ creature: 'sunbear', count: 2, area, seed: 2 }));
W_('boar', boar, 'wild boar with a mane ridge and tusks, roots when idle; { baby: true } striped piglets → behavior follow the sow',
  (stage, { area }) => {
    const sow = stage.actors({ creature: 'boar', area, seed: 2 });
    return stage.actors({ creature: 'boar', options: { baby: true }, count: 3, behavior: 'follow', target: sow, spacing: 2.6, area, seed: 3 });
  });
W_('muntjac', muntjac, 'muntjac (barking deer): small, reddish, short antlers (male), white tail flag; skittish sprinter',
  (stage, { area }) => stage.actors({ creature: 'muntjac', count: 3, variants: 2, area, seed: 2 }));
W_('tiger', tiger, 'Indochinese tiger: bold stripes, S-swaying tail; prowls slowly with long pauses (a rare easter egg)',
  (stage, { area }) => stage.actors({ creature: 'tiger', area, seed: 2 }));
W_('macaque', macaque, "macaque: grey-brown, pink face, tail up; quick, sits up when it stops; kind 'longtail' | 'pigtail', baby",
  (stage, { area }) => stage.actors({ creature: 'macaque', count: 4, variants: 2, area, seed: 2 }));
W_('monitor', monitor, 'water monitor lizard: long and low, yellow speckle bands, sprawling gait, swinging tail, tongue flicks',
  (stage, { area }) => stage.actors({ creature: 'monitor', count: 2, area, seed: 2 }));
W_('otter', otter, 'smooth-coated otter swimming at the surface (on water); families: behavior follow',
  (stage, { area }) => {
    const lead = stage.actors({ creature: 'otter', on: 'water', area, seed: 2 });
    return stage.actors({ creature: 'otter', count: 2, options: [{}, { baby: true }], behavior: 'follow', target: lead, on: 'water', area, seed: 3 });
  }, 'water');
W_('snake', snake, "slithering snake (travelling-wave segment chain); kind 'python' | 'cobra' (rears with hood when idle) | 'viper'",
  (stage, { area }) => stage.actors({ creature: 'snake', count: 3, options: [{ kind: 'python' }, { kind: 'cobra' }, { kind: 'viper' }], area, seed: 2 }));
