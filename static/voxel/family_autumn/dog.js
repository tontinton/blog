// The malamute: a big fluffy Alaskan malamute lying "sphinx" on the rug in front of the fire, head up,
// smiling with his tongue out. Charcoal saddle → grey → white legs/belly/ruff, the classic malamute face
// (white mask, dark cap running down as a bar between the eyes, white eyebrow spots, dark goggles),
// brown eyes, big black nose, a huge plush tail curled over his right hip.
//
// Parts (all in world coords, rest pose): body (breathes), head (turns/tilts), jaw (pants), earL/earR
// (twitch), tail (wags). Children of the head (jaw, ears) are composed with the head's transform in update().
import { VoxelGrid, noise, THREE } from '../lib/index.js';

// ---- placement -------------------------------------------------------------------------------------
// The dog is designed around anchor x = 15, z = 34; build() shifts it to layout's SPOTS.dog.anchor x/z.
// BASE is the lowest voxel layer (the dog lies ON y = BASE; the rug's top layer is y = 1) — shift here.
export const BASE = 2;
const AX = 15;                     // design centre column
const CX = AX + 0.5;               // continuous centre line (column AX)

export const MATERIALS = {
  dgK: { color: '#41444c', jitter: 0.06, noise: { color: '#35383f', scale: 0.3, amount: 0.5 } },   // charcoal saddle
  dgD: { color: '#5f646e', jitter: 0.06, noise: { color: '#535761', scale: 0.3, amount: 0.5 } },   // dark grey
  dgG: { color: '#8e939c', jitter: 0.06, noise: { color: '#80858f', scale: 0.3, amount: 0.4 } },   // mid grey
  dgL: { color: '#bcc0c7', jitter: 0.05 },                                                          // light grey
  dgW: { color: '#f5f5f3', jitter: 0.035 },                                                         // white
  dgC: { color: '#efe4d2', jitter: 0.04 },                                                          // cream / fawn tint
  dgEye: { color: '#5a3520', roughness: 0.25 },
  dgPupil: { color: '#1e120c', roughness: 0.2 },
  dgPupB: { color: '#1e120c', roughness: 0.2 },                                                    // lower-row pupil (blinks separately)
  dgHi: { color: '#f4e6d4', roughness: 0.2 },
  dgNose: { color: '#1b1a1d', roughness: 0.35 },
  dgMouth: { color: '#3b1a1e', roughness: 0.5 },
  dgTongue: { color: '#ee8792', roughness: 0.4, jitter: 0.03 },
  dgEarIn: { color: '#d6c8c2', jitter: 0.04 },
};
const LID = '#5f646e', LASH = '#2a2a30';   // closed eye: fur-grey lid over a dark lash line

// ---- little SDF kit (continuous coords, voxel x covers [x, x+1]) ----------------------------------
const ell = (x, y, z, c, r, p = 2) => {
  const a = Math.abs((x - c[0]) / r[0]) ** p + Math.abs((y - c[1]) / r[1]) ** p + Math.abs((z - c[2]) / r[2]) ** p;
  return (a ** (1 / p) - 1) * Math.min(r[0], r[1], r[2]);
};
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const rbox = (x, y, z, c, h, r) => {
  const qx = Math.abs(x - c[0]) - h[0] + r, qy = Math.abs(y - c[1]) - h[1] + r, qz = Math.abs(z - c[2]) - h[2] + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
};
const capsule = (x, y, z, a, b, r) => {
  const px = x - a[0], py = y - a[1], pz = z - a[2], bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const h = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz)));
  return Math.hypot(px - bx * h, py - by * h, pz - bz * h) - r;
};

export function build(g, P, { L }) {
  const N = noise(41);
  const nz = (x, y, z, s = 0.22) => N.simplex3(x * s, y * s, z * s);
  const B = BASE;
  const mk = () => new VoxelGrid(P);
  const stat = mk();                                         // static voxels (front legs), stamped into g at the end
  const body = mk(), head = mk(), jaw = mk(), earL = mk(), earR = mk(), tail = mk();
  const taken = (x, y, z) => stat.has(x, y, z) || body.has(x, y, z) || head.has(x, y, z) || jaw.has(x, y, z) || tail.has(x, y, z);

  // ======================= BODY (torso, haunches, chest & ruff, hind paws) ==========================
  const bodySdf = (x, y, z) => {
    let d = ell(x, y, z, [CX, B + 3.2, 31.8], [6.9, 6.4, 9.4], 2.4);                       // barrel
    d = smin(d, ell(x, y, z, [CX - 4.6, B + 3.3, 27.6], [3.6, 4.3, 5.0], 2.2), 2.5);     // haunches
    d = smin(d, ell(x, y, z, [CX + 4.6, B + 3.3, 27.6], [3.6, 4.3, 5.0], 2.2), 2.5);
    d = smin(d, ell(x, y, z, [CX, B + 5, 38.5], [6.4, 6.8, 4.8], 2.2), 3);               // chest
    d = smin(d, ell(x, y, z, [CX, B + 8.6, 39.6], [7.7, 4.8, 3.8], 2.2), 2.5);           // big mane around the neck
    return d;
  };
  const bodyCol = (x, y, z) => {
    const n = nz(x, y, z, 0.15), n2 = nz(x + 40, y, z, 0.5), hy = y - B, dx = Math.abs(x + 0.5 - CX), zc = z + 0.5;
    if (zc > 35) {                                         // mane & chest: white front, grey sides, dark collar
      const front = zc - 38.5 + (7 - dx) * 0.25 + n * 0.8;
      if (front > 2.2) return n2 > 0.25 && hy > 4 && zc > 41.5 ? 'dgC' : 'dgW';   // cream tint on the chest front
      const s = hy - 8.5 + n * 1.2 - front * 0.6;
      if (s > 1.2) return 'dgD';
      if (s > 0) return 'dgG';
      if (s > -2) return 'dgL';
      return 'dgW';
    }
    if (zc < 24.5 && hy < 4.5 + n) return 'dgW';          // white "britches" at the rear
    const s = hy - 6.0 + n * 0.8 + Math.max(0, 3 - dx) * 0.25;
    if (s >= 1.8 && dx < 3.5) return 'dgK';                // charcoal along the spine
    if (s >= 0.4) return 'dgD';
    if (s >= -1.0) return 'dgG';
    if (s >= -2.2) return 'dgL';
    return 'dgW';
  };
  body.sdf(bodySdf, [CX - 9, B, 20], [CX + 9, B + 13, 45], bodyCol);
  // hind paws poking forward from under the haunches
  for (const s of [-1, 1]) {
    body.sdf((x, y, z) => rbox(x, y, z, [CX + s * 6.2, B + 0.9, 32.2], [1.4, 0.9, 1.9], 0.7), [CX - 10, B, 28], [CX + 10, B + 2, 36], 'dgW', { mode: 'keep' });
  }

  // ======================= FRONT LEGS + PAWS (static) ==============================================
  for (const s of [-1, 1]) {
    const lx = CX + s * 3.4;
    stat.sdf((x, y, z) => smin(
      capsule(x, y, z, [lx, B + 1.6, 38], [lx, B + 1.5, 45], 1.6),
      rbox(x, y, z, [lx + s * 0.2, B + 1.3, 47.4], [2.1, 1.3, 2.3], 1.0), 1.2),
    [lx - 4, B, 36], [lx + 4, B + 4, 51], (x, y, z) => {
      if (body.has(x, y, z)) return 0;
      // toe grooves on the paw front
      if (z >= 49 && y <= B + 1 && ((Math.floor(x + 0.5 - lx + 10) % 2) === 0)) return 'dgL';
      return 'dgW';
    }, { mode: 'keep' });
  }

  // ======================= HEAD (skull, cheeks, upper muzzle, nose) ================================
  // Chibi block head: skull x AX−5..AX+5, y HY+1..HY+9 (cheeks to ±6), flat face plane at z = FZ; muzzle z 47..49.
  const FZ = 46, HY = B + 7;                                // face plane z, chin y (lower jaw row)
  const skull = (x, y, z) => smin(
    rbox(x, y, z, [CX, HY + 5.5, 43], [5.5, 4.5, 4], 1.6),
    smin(rbox(x, y, z, [CX, HY + 4, 44], [6.5, 2, 3], 1.3),                         // broad cheek fluff …
      rbox(x, y, z, [CX, HY + 2.5, 44], [5.5, 1.5, 3], 1.0), 0.6), 0.8);           // … tapering to the chin
  const muzzle = (x, y, z) => rbox(x, y, z, [CX, HY + 3.5, 48], [2.5, 1.5, 2], 0.7);  // y HY+2..HY+4, z 46..49
  head.sdf((x, y, z) => Math.min(skull(x, y, z), muzzle(x, y, z)), [CX - 8, HY + 1, 37], [CX + 8, HY + 10, 50], (x, y, z) => {
    const n = nz(x, y, z, 0.4), hy = y - HY, dx = x - AX, adx = Math.abs(dx);
    if (z >= FZ + 1) return 'dgW';                                          // muzzle
    if (z < 40 + n * 0.8) return hy > 5 ? 'dgD' : hy > 3 ? 'dgG' : 'dgL';   // back of the head
    if (hy >= 8) return n > 0.62 ? 'dgG' : 'dgD';                           // cap (a few silvery hairs)
    if (adx >= 5 && hy >= 5 + n * 0.7) return hy >= 7 ? 'dgD' : 'dgG';    // grey sides of the mask
    if (z < 43 && hy >= 6 + n * 0.5) return 'dgD';
    return 'dgW';
  });
  // face map on the front plane (columns dx −5..5, keyed by height above HY)
  const FACE = {
    9: '.DDDDDDDDD.',
    8: 'DDWWDDDWWDD',     // white eyebrow spots
    7: 'GKKKDDDKKKG',     // dark upper lids / goggles, cap running down between the eyes
    6: 'GKPHGDGPHKG',     // eyes: pupil + highlight …
    5: 'WKQEKGKQEKW',     // … over pupil + brown iris; grey bar to the nose bridge
    4: 'WWWWWGWWWWW',
  };
  const FACEMAT = { Q: 'dgPupB', K: 'dgK', D: 'dgD', G: 'dgG', W: 'dgW', C: 'dgC', E: 'dgEye', P: 'dgPupil', H: 'dgHi', N: 'dgNose' };
  const front = (x, y) => { for (let z = 52; z >= 38; z--) if (head.has(x, y, z)) return z; return -1; };
  for (const [hy, row] of Object.entries(FACE)) {
    const y = HY + Number(hy);
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]; if (ch === '.') continue;
      const x = AX - 5 + i, zf = front(x, y);
      if (zf >= 0) head.set(x, y, zf, FACEMAT[ch]);
    }
  }
  // nose bridge stripe along the top of the muzzle, fading out
  head.set(AX, HY + 4, FZ + 1, 'dgG'); head.set(AX, HY + 4, FZ + 2, 'dgL');
  // big black nose on the muzzle tip
  for (let x = AX - 1; x <= AX + 1; x++) { head.set(x, HY + 4, 49, 'dgNose'); head.set(x, HY + 3, 49, x === AX ? 'dgNose' : 'dgNose'); head.set(x, HY + 4, 50, 'dgNose'); }
  head.set(AX, HY + 3, 50, 'dgNose');

  // smile: mouth corners curling up into the cheeks
  for (const s of [-1, 1]) { head.set(AX + s * 3, HY + 1, FZ, 'dgMouth'); head.set(AX + s * 3, HY + 2, FZ, 'dgMouth'); }
  // fluffy cheek tufts sticking out sideways
  for (const s of [-1, 1]) for (const [dx, hy, z] of [[7, 3, 43], [7, 4, 44], [7, 4, 42], [6, 1, 43]]) {
    const x = AX + s * dx, y = HY + hy;
    if (!head.has(x, y, z)) head.set(x, y, z, hy >= 4 ? 'dgL' : 'dgW');
  }

  // ======================= JAW (lower jaw + tongue) ================================================
  for (let x = AX - 2; x <= AX + 2; x++) for (let z = 44; z <= 48; z++) {
    if (Math.abs(x - AX) === 2 && z === 48) continue;                     // rounded chin
    if (!head.has(x, HY, z)) jaw.set(x, HY, z, 'dgW');
  }
  for (let x = AX - 2; x <= AX + 2; x++) for (let z = 47; z <= 48; z++) {
    jaw.set(x, HY + 1, z, Math.abs(x - AX) <= 1 ? 'dgTongue' : 'dgMouth');
  }
  // tongue tip lolling over the lower lip
  jaw.set(AX, HY, 49, 'dgTongue'); jaw.set(AX + 1, HY, 49, 'dgTongue'); jaw.set(AX, HY + 1, 49, 'dgTongue'); jaw.set(AX + 1, HY + 1, 49, 'dgTongue');
  jaw.set(AX, HY - 1, 49, 'dgTongue');

  // ======================= EARS =====================================================================
  // right-ear pattern (columns dx 2..5), bottom row first; front layer z = 42, back layer all dark
  const EAR = ['KIIK', 'KIIK', '.KIK', '.KK.'];
  const ears = [];
  for (const s of [-1, 1]) {
    const eg = s < 0 ? earL : earR;
    EAR.forEach((row, r) => {
      for (let i = 0; i < row.length; i++) {
        if (row[i] === '.') continue;
        const x = AX + s * (2 + i), y = HY + 10 + r;
        if (!taken(x, y, 42)) eg.set(x, y, 42, row[i] === 'I' ? 'dgEarIn' : 'dgK');
        if (!taken(x, y, 41)) eg.set(x, y, 41, 'dgK');
      }
    });
    ears.push({ grid: eg, pivot: [CX + s * 3.5, HY + 10, 42] });
  }

  // ======================= TAIL (big plume arched over the right hip) ==============================
  const tailPath = [[CX + 0.5, B + 6.5, 24.6], [CX + 3.5, B + 8.6, 24.4], [CX + 7.4, B + 8.4, 25.8], [CX + 9.8, B + 6.2, 29], [CX + 10.4, B + 3.8, 32.4], [CX + 9.2, B + 2.9, 35.6]];
  const samples = [];
  for (let i = 0; i < tailPath.length - 1; i++) for (let k = 0; k < 8; k++) {
    const t = k / 8, a = tailPath[i], b = tailPath[i + 1];
    samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  samples.push(tailPath[tailPath.length - 1]);
  const tailNear = (x, y, z) => {
    let best = 1e9, bi = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i], d = Math.hypot(x - s[0], y - s[1], z - s[2]);
      if (d < best) { best = d; bi = i; }
    }
    return [best, bi / (samples.length - 1), samples[bi]];
  };
  const tailR = (u) => 1.3 + 1.7 * Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.92);
  tail.sdf((x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      d = Math.min(d, Math.hypot(x - s[0], y - s[1], z - s[2]) - tailR(i / (samples.length - 1)));
    }
    return d - nz(x, y, z, 0.6) * 0.45;                       // fluffy, uneven edge
  }, [CX - 2, B, 16], [CX + 15, B + 15, 38], (x, y, z) => {
    if (body.has(x, y, z) || stat.has(x, y, z)) return 0;
    const n = nz(x, y, z, 0.5);
    const [, u, s] = tailNear(x + 0.5, y + 0.5, z + 0.5);
    const up = y + 0.5 - s[1] + (x + 0.5 - s[0]) * 0.35;     // "top" = up and outward
    if (u > 0.86) return up > 0.3 + n ? 'dgL' : 'dgW';        // pale tip
    if (up > 1.4 + n * 0.6) return u > 0.25 && u < 0.55 && n > -0.2 ? 'dgK' : 'dgD';
    if (up > 0.2 + n * 0.6) return 'dgG';
    if (up > -0.8 + n * 0.6) return 'dgL';
    return 'dgW';
  });

  // parts must not share cells: the head/jaw win over the ruff
  const clash = [];
  body.forEach((x, y, z) => { if (head.has(x, y, z) || jaw.has(x, y, z)) clash.push([x, y, z]); });
  for (const [x, y, z] of clash) body.del(x, y, z);

  const pivots = {
    body: [CX, B, 33],
    head: [CX, HY + 1.5, 42],
    jaw: [CX, HY + 1, 44.5],
    tail: [CX + 0.5, B + 6.5, 24.6],
  };

  // ---- place: shift from the design anchor (15, 34) to the layout's anchor ----
  const [ax, , az] = L?.SPOTS?.dog?.anchor ?? [15, 1, 34];
  const OX = ax - 15, OZ = az - 34;
  const shift = (gr) => { if (!OX && !OZ) return gr; const o = mk(); o.stamp(gr, OX, 0, OZ); return o; };
  const sp = (p) => [p[0] + OX, p[1], p[2] + OZ];
  for (const k of Object.keys(pivots)) pivots[k] = sp(pivots[k]);
  for (const e of ears) e.pivot = sp(e.pivot);
  g.stamp(stat, OX, 0, OZ, { mode: 'keep' });

  const parts = [
    { name: 'body', grid: shift(body), pivot: pivots.body },
    { name: 'head', grid: shift(head), pivot: pivots.head },
    { name: 'jaw', grid: shift(jaw), pivot: pivots.jaw },
    { name: 'earL', grid: shift(earL), pivot: ears[0].pivot },
    { name: 'earR', grid: shift(earR), pivot: ears[1].pivot },
    { name: 'tail', grid: shift(tail), pivot: pivots.tail },
  ];

  // ======================= ANIMATION ================================================================
  const sm = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
  // head schedule (period 16 s): viewer → fire → viewer, with a cute tilt in between
  const headPose = (t) => {
    const c = ((t % 16) + 16) % 16;
    const toFire = sm(4, 5.5, c) - sm(8.5, 10, c);
    const tilt = sm(10.5, 11.3, c) - sm(13.2, 14, c);
    const yaw = 0.22 * (1 - toFire) - 0.42 * toFire + Math.sin(t * 0.7) * 0.03;
    const roll = 0.16 * tilt + Math.sin(t * 0.5) * 0.02;
    const pitch = -0.04 * toFire + Math.sin(t * 0.9) * 0.015;
    return { yaw, roll, pitch };
  };
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const compose = (child, parent, pPivot, cPivot, local) => {
    // child world = parent transform ∘ local rotation about child pivot
    v.set(cPivot[0] - pPivot[0], cPivot[1] - pPivot[1], cPivot[2] - pPivot[2]).applyQuaternion(parent.quaternion);
    child.position.copy(parent.position).add(v);
    child.quaternion.copy(parent.quaternion).multiply(local);
  };

  return {
    parts,
    update(t, p, Pal, self) {
      const pant = Math.sin(t * Math.PI * 2 * 1.5);
      const breath = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.75);
      if (p.body) { p.body.scale.set(1 + 0.008 * breath, 1 + 0.02 * breath, 1); }
      const rise = 0.02 * breath * 8.5;
      if (p.head) {
        const { yaw, roll, pitch } = headPose(t);
        p.head.rotation.set(pitch, yaw, roll, 'YXZ');
        p.head.position.set(pivots.head[0], pivots.head[1] + rise, pivots.head[2]);
        p.head.updateMatrix();
        if (p.jaw) { q.setFromEuler(e.set(0.07 + 0.05 * pant, 0, 0)); compose(p.jaw, p.head, pivots.head, pivots.jaw, q); }
        const twitch = (ph) => { const c = ((t + ph) % 7.3 + 7.3) % 7.3; return c > 3 && c < 3.45 ? Math.sin((c - 3) / 0.45 * Math.PI * 2) * 0.22 : 0; };
        if (p.earL) { q.setFromEuler(e.set(0, 0, 0.04 + twitch(0))); compose(p.earL, p.head, pivots.head, ears[0].pivot, q); }
        if (p.earR) { q.setFromEuler(e.set(0, 0, -0.04 - twitch(3.1))); compose(p.earR, p.head, pivots.head, ears[1].pivot, q); }
      }
      if (p.tail) {
        // happy wag: the plume lifts off the hip and sways, then thumps back down
        const w = Math.sin(t * Math.PI * 2 * 0.75);
        p.tail.rotation.set(0, 0.1 * w, 0.07 + 0.07 * w, 'YXZ');
      }
      // blinks (state change only)
      const bc = ((t % 4.7) + 4.7) % 4.7, bc2 = ((t % 11.3) + 11.3) % 11.3;
      const closed = (bc > 2.2 && bc < 2.34) || (bc2 > 6 && bc2 < 6.12);
      if (self._closed !== closed) {
        self._closed = closed;
        Pal.update('dgPupil', { color: closed ? LID : MATERIALS.dgPupil.color });
        Pal.update('dgHi', { color: closed ? LID : MATERIALS.dgHi.color });
        Pal.update('dgEye', { color: closed ? LASH : MATERIALS.dgEye.color });
        Pal.update('dgPupB', { color: closed ? LASH : MATERIALS.dgPupB.color });
        Pal.texture?.();                       // refresh now (the stage refreshes before updaters run)
      }
    },
  };
}
