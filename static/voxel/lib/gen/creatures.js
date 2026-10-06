// Creatures: rig factories for stage.actors(). Each returns a rig (see actors.js) built from small part
// grids in rig space (feet at y = 0, facing +z). All are registered, so stage.actors({ creature: 'cat' }).
//
//   stage.actors({ creature: 'cat', count: 3, options: { coat: 'calico' } });
//   stage.actors({ creature: 'walker', count: 20, variants: 5, behavior: 'path', path });
//   stage.actors({ creature: 'sheep', count: 8, area: [[0, 0], [40, 40]] });
//
// New animal? Most four-legged ones are a quadruped() call with different proportions (see dog/sheep/pig
// below); anything else is rig([{ grid, role, pivot }, …]) — see docs/cookbook.md "Animate".
import { VoxelGrid } from '../grid.js';
import '../shapes.js';
import { Palette } from '../palette.js';
import { rng } from '../random.js';
import { shade } from '../color.js';
import { rig } from '../actors.js';
import { defineCreature } from '../registry.js';
import { PEOPLE } from './build.js';

const COATS = {
  orange: { fur: '#e58b3a', fur2: '#c0612a', belly: '#f6e4c8', pattern: 'tabby' },
  ginger: { fur: '#e58b3a', fur2: '#c0612a', belly: '#f6e4c8', pattern: 'tabby' },
  black: { fur: '#2a2a31', fur2: '#1d1d23', belly: '#34343c', eye: '#d8c43a', pattern: 'solid' },
  white: { fur: '#f3f0ea', fur2: '#e1ddd4', belly: '#f3f0ea', pattern: 'solid' },
  grey: { fur: '#8e8f97', fur2: '#62636c', belly: '#c9c9cf', pattern: 'tabby' },
  tuxedo: { fur: '#26262c', fur2: '#26262c', belly: '#f3f0ea', paw: '#f3f0ea', pattern: 'socks' },
  calico: { fur: '#f3eee4', fur2: '#df8a3e', fur3: '#2e2a2a', belly: '#f3eee4', pattern: 'patches' },
  siamese: { fur: '#efe2cc', fur2: '#5a4134', belly: '#f4ead8', eye: '#4a8ad8', pattern: 'points' },
  brown: { fur: '#8a5a36', fur2: '#6a4226', belly: '#c8a07a', pattern: 'solid' },
  golden: { fur: '#d8a85a', fur2: '#b8843e', belly: '#ecd2a0', pattern: 'solid' },
  spotted: { fur: '#f2efe8', fur2: '#2e2a28', belly: '#f2efe8', pattern: 'patches' },
  fox: { fur: '#d9692a', fur2: '#2a2220', belly: '#f4ede2', pattern: 'mask' },
  wool: { fur: '#f2eee4', fur2: '#2e2a2a', belly: '#e8e2d4', pattern: 'solid' },
  pink: { fur: '#f2a8a8', fur2: '#e08a8e', belly: '#f6b8b6', nose: '#d97a80', pattern: 'solid' },
};

/**
 * Generic four-legged animal. o: seed, coat (COATS name or { fur, fur2, fur3, belly, paw, eye, nose, inner,
 * pattern }), pattern ('solid' | 'tabby' | 'patches' | 'points' | 'socks' | 'mask'), width (3), length (6),
 * legH (2), legInset (0), bodyH (2), headW (width), headH (3), headD (2), neck (0, raises the head),
 * snout (0 | n voxels), ears ('pointy' | 'floppy' | 'side' | 'none'), earH (1), tail ('up' | 'wag' |
 * 'bushy' | 'stub' | 'long' | 'none'), headColor (fur2 → dark face, sheep), + rig opts (scale, speed,
 * stride, sprint, anim).
 */
export function quadruped(o = {}) {
  const R = rng(o.seed ?? 1);
  const coat = typeof o.coat === 'object' ? o.coat : COATS[o.coat ?? 'orange'] ?? COATS.orange;
  const pattern = o.pattern ?? coat.pattern ?? 'solid';
  const P = new Palette({
    fur: { color: coat.fur, jitter: 0.05 },
    fur2: { color: coat.fur2 ?? shade(coat.fur, -0.25), jitter: 0.04 },
    fur3: { color: coat.fur3 ?? coat.fur2 ?? coat.fur, jitter: 0.04 },
    belly: { color: coat.belly ?? coat.fur, jitter: 0.03 },
    paw: { color: coat.paw ?? coat.belly ?? coat.fur, jitter: 0.03 },
    eye: { color: coat.eye ?? '#15151a', roughness: 0.2 },
    nose: { color: coat.nose ?? '#2a1e1e', jitter: 0 },
    inner: { color: coat.inner ?? '#e7a0a0', jitter: 0 },
  });
  const W = o.width ?? 3, L = o.length ?? 6, LH = o.legH ?? 2, BH = o.bodyH ?? 2, inset = o.legInset ?? 0;
  const HW = o.headW ?? W, HH = o.headH ?? 3, HD = o.headD ?? 2;
  const top = LH + BH - 1, hx0 = Math.floor((W - HW) / 2), hx1 = hx0 + HW - 1;
  const hy0 = top + (o.neck ?? 0), hy1 = hy0 + HH - 1, hz0 = L - (o.headInset ?? 0), hz1 = hz0 + HD - 1;
  const tc = Math.floor((W - 1) / 2);
  const spots = new Set();
  if (pattern === 'patches') for (let k = 0; k < 4 + R.int(0, 3); k++) spots.add(`${R.int(0, W - 1)},${R.int(LH, hy1)},${R.int(-2, hz1)},${R.chance(0.5) ? 2 : 3}`);
  const patch = (x, y, z) => {
    for (const s of spots) { const [a, b, c, m] = s.split(',').map(Number); if ((x - a) ** 2 + (y - b) ** 2 + (z - c) ** 2 <= 2.2) return m === 2 ? 'fur2' : 'fur3'; }
    return null;
  };
  const color = (x, y, z, region) => {
    if (o.headColor && (region === 'head' || region === 'ear' || (region === 'leg' && y < LH - 0))) return o.headColor;
    if (region === 'body' && y === LH && coat.belly && pattern !== 'points') return 'belly';
    switch (pattern) {
      case 'tabby': return (region === 'body' || region === 'head') && (z % 2 === 0) && (y >= top || x === 0 || x === W - 1) && y > LH ? 'fur2'
        : region === 'tail' && (y + z) % 2 === 0 ? 'fur2' : 'fur';
      case 'patches': return patch(x, y, z) ?? 'fur';
      case 'points': return region === 'body' ? 'fur' : region === 'leg' ? (y === 0 ? 'fur2' : 'fur') : 'fur2';
      case 'socks': return region === 'leg' && y === 0 ? 'paw' : region === 'head' && y === hy0 && z === hz1 ? 'belly' : 'fur';
      case 'mask': return region === 'leg' ? (y < LH - 1 || LH === 1 ? 'fur2' : 'fur') : region === 'head' && (y === hy0 || z > hz1) ? 'belly'
        : region === 'ear' ? 'fur2' : 'fur';
      default: return 'fur';
    }
  };
  const part = () => new VoxelGrid(P);
  const parts = [];

  // body
  const body = part();
  for (let x = 0; x < W; x++) for (let y = LH; y <= top; y++) for (let z = 0; z < L; z++) body.set(x, y, z, color(x, y, z, 'body'));
  parts.push({ name: 'body', role: 'body', grid: body });

  // legs: pair 0 front, 1 back; side −1 at x = inset, +1 at x = W−1−inset
  for (const [pair, z] of [[0, L - 1 - (o.legInsetZ ?? 0)], [1, o.legInsetZ ?? 0]]) for (const [side, x] of [[-1, inset], [1, W - 1 - inset]]) {
    const g = part();
    for (let y = 0; y < LH; y++) g.set(x, y, z, color(x, y, z, 'leg'));
    parts.push({ name: `leg${pair ? 'B' : 'F'}${side < 0 ? 'L' : 'R'}`, role: 'leg', side, pair, grid: g, pivot: [x + 0.5, LH, z + 0.5] });
  }

  // head (+ snout, eyes, ears)
  const head = part();
  for (let x = hx0; x <= hx1; x++) for (let y = hy0; y <= hy1; y++) for (let z = hz0; z <= hz1; z++) head.set(x, y, z, color(x, y, z, 'head'));
  if (o.neck) for (let y = top + 1; y < hy0; y++) head.set(tc, y, hz0, color(tc, y, hz0, 'head'));
  const sn = o.snout ?? 0;
  const sw = o.snoutW ?? Math.max(1, HW - 2), sx0 = hx0 + Math.floor((HW - sw) / 2);
  for (let k = 1; k <= sn; k++) for (let x = sx0; x < sx0 + sw; x++) for (let y = hy0; y < hy0 + (o.snoutH ?? 1); y++) head.set(x, y, hz1 + k, color(x, y, hz1 + k, 'head'));
  if (sn) for (let x = sx0; x < sx0 + sw; x++) head.set(x, hy0 + (o.snoutH ?? 1) - 1, hz1 + sn, 'nose');
  else if (HW >= 3) head.set(hx0 + Math.floor(HW / 2), hy0, hz1, coat.nose ? 'nose' : 'belly');
  const ey = Math.min(hy1, hy0 + (sn ? 1 : HH >= 3 ? 1 : 0));
  head.set(hx0, ey, hz1, 'eye'); head.set(hx1, ey, hz1, 'eye');
  const ears = o.ears ?? 'pointy', eh = o.earH ?? 1;
  if (ears === 'pointy') for (const x of [hx0, hx1]) for (let k = 1; k <= eh; k++) head.set(x, hy1 + k, hz0, k === 1 && eh > 1 ? 'inner' : color(x, hy1 + k, hz0, 'ear'));
  else if (ears === 'floppy') for (const x of [hx0 - 1, hx1 + 1]) for (let k = 0; k < 1 + eh; k++) head.set(x, hy1 - k, hz0, 'fur2');
  else if (ears === 'side') for (const x of [hx0 - 1, hx1 + 1]) head.set(x, hy1, hz0, color(x, hy1, hz0, 'ear'));
  parts.push({ name: 'head', role: 'head', grid: head, pivot: [W / 2, top + 0.5, hz0] });

  // tail
  const tail = part(), t = o.tail ?? 'up';
  const tv = { up: [[top, -1], [top + 1, -1], [top + 2, -2], [top + 3, -2]], wag: [[top, -1], [top + 1, -2], [top + 2, -2]],
    bushy: [[top, -1], [top, -2], [top - 1, -2], [top - 1, -3], [top - 2, -3], [top - 2, -4]], stub: [[top, -1]],
    long: [[top, -1], [top - 1, -1], [top - 2, -1], [top - 3, -1]], none: [] }[t] ?? [];
  tv.forEach(([y, z], i) => tail.set(tc, y, z, t === 'bushy' && i >= tv.length - 1 ? 'belly' : t === 'long' && i === tv.length - 1 ? 'fur2' : color(tc, y, z, 'tail')));
  if (t === 'bushy') for (const [y, z] of tv.slice(1, -1)) { tail.set(tc - 1, y, z, 'fur'); if (W > 2) tail.set(tc + 1, y, z, 'fur'); }
  parts.push({ name: 'tail', role: 'tail', grid: tail, pivot: [tc + 0.5, top + 0.5, 0] });

  return rig(parts, { palette: P, stride: o.stride ?? L * 0.75, speed: o.speed, scale: o.scale ?? 0.5, sprint: o.sprint ?? 0, idle: o.idle, anim: o.anim });
}

/** Cat. opts: coat ('orange' | 'black' | 'white' | 'grey' | 'tuxedo' | 'calico' | 'siamese' | {...}), scale (0.5), seed. */
export function cat(o = {}) {
  return quadruped({ coat: o.coat ?? ['orange', 'black', 'grey', 'tuxedo', 'calico', 'white', 'siamese'][rng(o.seed ?? 1).int(0, 6)],
    width: 3, length: 6, legH: 2, bodyH: 2, headH: 3, headD: 2, ears: 'pointy', tail: 'up', speed: [2, 3.4], sprint: 0.35, stride: 4,
    anim: { legSwing: 0.8, bob: 0.2, tailSway: 0.4 }, ...o });
}
/** Dog. opts: coat ('golden' | 'brown' | 'black' | 'white' | 'spotted' | {...}), size ('small' | 'medium' | 'big'). */
export function dog(o = {}) {
  const big = o.size === 'big' ? 1 : o.size === 'small' ? -1 : 0;
  return quadruped({ coat: o.coat ?? ['golden', 'brown', 'black', 'spotted', 'white'][rng(o.seed ?? 1).int(0, 4)],
    width: 3, length: 6 + big, legH: 3 + big, bodyH: 2 + Math.max(0, big), headH: 3, headD: 2, snout: 2, ears: 'floppy', earH: 1, tail: 'wag', scale: 0.55,
    speed: [2.4, 4], sprint: 0.3, stride: 4.5, anim: { legSwing: 0.7, tailSway: 0.7, tailSpeed: 9, tailLift: -0.5 }, ...o });
}
/** Fox: orange, dark socks and ears, white muzzle, bushy tail. */
export function fox(o = {}) {
  return quadruped({ coat: 'fox', width: 3, length: 6, legH: 2, bodyH: 2, headH: 2, headD: 2, snout: 1, ears: 'pointy', earH: 2, tail: 'bushy',
    scale: 0.5, speed: [2.2, 3.8], sprint: 0.3, stride: 4, anim: { tailSway: 0.25, tailLift: 0.1 }, ...o });
}
/** Sheep: wool body, dark face and legs, grazes when idle. */
export function sheep(o = {}) {
  return quadruped({ coat: 'wool', width: 5, length: 6, legH: 2, legInset: 1, bodyH: 3, headW: 3, headH: 3, headD: 2, ears: 'side', tail: 'stub',
    headColor: 'fur2', scale: 0.5, speed: [0.7, 1.3], idle: [2, 6], stride: 3.5, anim: { legSwing: 0.5, bob: 0.1, graze: 0.7 }, ...o });
}
/** Pig: pink, snout, curly tail. */
export function pig(o = {}) {
  return quadruped({ coat: 'pink', width: 4, length: 6, legH: 2, bodyH: 3, headW: 4, headH: 3, headD: 2, snout: 1, snoutW: 2, ears: 'pointy', tail: 'stub',
    scale: 0.5, speed: [1, 1.8], stride: 3.5, anim: { legSwing: 0.5, bob: 0.15, graze: 0.4 }, ...o });
}

/**
 * Walking person (~7 voxels tall, like build.person). opts: skin, shirt, pants, hair, hat (color), height
 * (7 | 8), seed (random clothes; pair with actors `variants: n` for a varied crowd), scale (1).
 */
export function walker(o = {}) {
  const R = rng(o.seed ?? 1);
  const P = new Palette({
    skin: { color: o.skin ?? R.pick(PEOPLE.skin), jitter: 0.02 },
    shirt: { color: o.shirt ?? R.pick(PEOPLE.shirt), jitter: 0.04 },
    pants: { color: o.pants ?? R.pick(PEOPLE.pants), jitter: 0.04 },
    hair: { color: o.hair ?? R.pick(PEOPLE.hair), jitter: 0.04 },
    shoe: { color: '#2a2422', jitter: 0.02 },
    hat: { color: o.hat ?? '#b8423a', jitter: 0.03 },
  });
  const H = o.height ?? 7, leg = H >= 8 ? 3 : 2, torso = 2, hy = leg + torso;
  const part = () => new VoxelGrid(P);
  const parts = [];
  for (const [side, x] of [[-1, 0], [1, 1]]) {
    const g = part();
    for (let y = 0; y < leg; y++) g.set(x, y, 0, y === 0 && leg > 2 ? 'shoe' : 'pants');
    parts.push({ name: side < 0 ? 'legL' : 'legR', role: 'leg', side, pair: 0, grid: g, pivot: [x + 0.5, leg, 0.5] });
  }
  const body = part();
  body.box([0, leg, 0], [1, hy - 1, 0], 'shirt');
  parts.push({ name: 'body', role: 'body', grid: body });
  for (const [side, x] of [[-1, -1], [1, 2]]) {
    const g = part();
    g.set(x, leg, 0, 'skin'); g.set(x, leg + 1, 0, 'shirt');
    parts.push({ name: side < 0 ? 'armL' : 'armR', role: 'arm', side, grid: g, pivot: [x + 0.5, hy - 0.2, 0.5] });
  }
  const head = part();
  head.box([0, hy, 0], [1, hy + 1, 0], 'skin');
  head.box([0, hy + 2, 0], [1, hy + 2, 0], o.hat ? 'hat' : 'hair');
  head.box([0, hy + 1, -1], [1, hy + 2, -1], 'hair');
  if (o.hat) { head.box([-1, hy + 2, -1], [2, hy + 2, 1], 'hat'); head.box([0, hy + 3, -1], [1, hy + 3, 0], 'hat'); }
  parts.push({ name: 'head', role: 'head', grid: head, pivot: [1, hy, 0.5] });
  return rig(parts, { palette: P, stride: 3.2, speed: o.speed ?? [1.5, 2.5], scale: o.scale ?? 1, anim: { legSwing: 0.65, armSwing: 0.55, bob: 0.3, headNod: 0.04, ...(o.anim ?? {}) } });
}

/** Bird (gull-ish). opts: body, wing, tip, beak colors, scale (0.6). Flies: default behavior 'flock'. */
export function bird(o = {}) {
  const P = new Palette({
    body: { color: o.body ?? '#f2f1ec', jitter: 0.03 }, wing: { color: o.wing ?? '#a3abb5', jitter: 0.04 },
    tip: { color: o.tip ?? '#2a2a30', jitter: 0.02 }, beak: { color: o.beak ?? '#f0a83a', jitter: 0 },
  });
  const part = () => new VoxelGrid(P);
  const body = part();
  body.box([0, 1, 0], [1, 2, 3], 'body'); body.box([0, 2, -1], [1, 2, -1], 'wing');
  body.box([0, 2, 4], [1, 3, 4], 'body'); body.box([0, 2, 5], [1, 2, 5], 'beak');
  const wings = [-1, 1].map((side) => {
    const g = part();
    const xs = side < 0 ? [-4, -1] : [2, 5];
    g.box([xs[0], 2, 1], [xs[1], 2, 2], 'wing');
    g.box([side < 0 ? -4 : 5, 2, 1], [side < 0 ? -4 : 5, 2, 2], 'tip');
    return { name: side < 0 ? 'wingL' : 'wingR', role: 'wing', side, grid: g, pivot: [side < 0 ? 0 : 2, 2.5, 1.5] };
  });
  return rig([{ name: 'body', role: 'body', grid: body }, ...wings], { palette: P, fly: true, scale: o.scale ?? 0.6, speed: o.speed ?? [5, 8], anim: { flap: 0.8, flapSpeed: 10, glide: 0.4, ...(o.anim ?? {}) } });
}

/** Butterfly. opts: color, color2, scale (0.35). Try behavior 'wander' with altitude [1, 4] around flowers. */
export function butterfly(o = {}) {
  const R = rng(o.seed ?? 1);
  const c = o.color ?? R.pick(['#f2a03a', '#7ab8f0', '#f2e25a', '#f07ab0', '#f4f2ee']);
  const P = new Palette({ body: { color: '#2a2422' }, wing: { color: c, jitter: 0.05, emissive: o.glow ?? 0 }, wing2: { color: o.color2 ?? shade(c, -0.3), jitter: 0.03 } });
  const body = new VoxelGrid(P);
  body.box([0, 0, 0], [0, 0, 2], 'body');
  const wings = [-1, 1].map((side) => {
    const g = new VoxelGrid(P);
    const x0 = side < 0 ? -3 : 1, x1 = side < 0 ? -1 : 3;
    g.box([x0, 0, 0], [x1, 0, 3], 'wing');
    g.set(side < 0 ? -3 : 3, 0, 3, 'wing2'); g.set(side < 0 ? -3 : 3, 0, 0, 'wing2');
    return { name: side < 0 ? 'wingL' : 'wingR', role: 'wing', side, grid: g, pivot: [side < 0 ? 0 : 1, 0.5, 1.5] };
  });
  return rig([{ name: 'body', role: 'body', grid: body }, ...wings], { palette: P, fly: true, scale: o.scale ?? 0.35, speed: o.speed ?? [1.2, 2.4], anim: { flap: 1.1, flapSpeed: 16, ...(o.anim ?? {}) } });
}

/** Duck: swims on water (on: 'water' by default). opts: kind ('mallard' | 'white'), baby (yellow, small). */
export function duck(o = {}) {
  const baby = !!o.baby, white = o.kind === 'white';
  const P = new Palette({
    body: { color: baby ? '#f5d65a' : white ? '#f4f2ec' : '#9a7a5a', jitter: 0.04 },
    wing: { color: baby ? '#e8c444' : white ? '#e2ded4' : '#6a5440', jitter: 0.04 },
    head: { color: baby ? '#f5d65a' : white ? '#f4f2ec' : '#2f6a4a', jitter: 0.03 },
    beak: { color: '#f0a030', jitter: 0 },
  });
  const body = new VoxelGrid(P);
  body.box([0, 0, 0], [3, 1, 4], 'body');
  body.box([0, 1, 1], [0, 1, 3], 'wing'); body.box([3, 1, 1], [3, 1, 3], 'wing');
  body.box([1, 2, -1], [2, 2, 0], 'wing');
  const head = new VoxelGrid(P);
  head.box([1, 2, 3], [2, 3, 4], 'head'); head.box([1, 2, 5], [2, 2, 5], 'beak');
  return rig([{ name: 'body', role: 'body', grid: body }, { name: 'head', role: 'head', grid: head, pivot: [2, 2, 3.5] }],
    { palette: P, swim: true, lift: -0.7, scale: o.scale ?? (baby ? 0.3 : 0.5), speed: o.speed ?? [0.6, 1.3], anim: { headNod: 0.15, ...(o.anim ?? {}) } });
}

/** Fish (koi by default): swims just under the water surface. opts: color, color2, depth (0.3 = voxels between surface and back). */
export function fish(o = {}) {
  const P = new Palette({ body: { color: o.color ?? '#f07a2a', jitter: 0.05 }, spot: { color: o.color2 ?? '#f4f0e8', jitter: 0.03 } });
  const body = new VoxelGrid(P);
  body.box([0, 0, 0], [1, 1, 3], 'body'); body.set(0, 1, 1, 'spot'); body.set(1, 1, 2, 'spot'); body.box([0, 2, 1], [1, 2, 1], 'body');
  const tail = new VoxelGrid(P);
  tail.box([0, 0, -2], [1, 1, -1], 'body'); tail.set(0, 1, -2, 'spot');
  const scale = o.scale ?? 0.5;
  return rig([{ name: 'body', role: 'body', grid: body }, { name: 'tail', role: 'fin', grid: tail, pivot: [1, 1, 0] }],
    { palette: P, swim: true, lift: -(o.depth ?? 0.3) / scale - 3, scale, speed: o.speed ?? [0.8, 1.6] });
}

// meta.habitat ('ground' | 'water' | 'air') tells the catalog what cell to build; example(stage, { area, center })
// spawns a few into that cell (lab ?scene=catalog&kind=creature). Every factory is unit-tested (tools/test.mjs).
const C_ = (name, fn, summary, habitat = 'ground', extra = {}) => defineCreature(name, fn, {
  summary, habitat,
  example: (stage, { area, center }) => stage.actors({ creature: name, count: 3, area, ...(habitat === 'water' ? { on: 'water' } : {}),
    ...(habitat === 'air' && !extra.behavior ? { behavior: 'circle', center: [center[0], center[1] + 12, center[2]], radius: 7 } : {}), ...extra }),
});
C_('cat', cat, 'cat; coats orange/black/white/grey/tuxedo/calico/siamese; wanders + sprints', 'ground', { variants: 3 });
C_('dog', dog, 'dog; coats golden/brown/black/spotted/white; size small/medium/big', 'ground', { variants: 2 });
C_('fox', fox, 'fox with a bushy tail');
C_('sheep', sheep, 'sheep; slow, grazes when idle');
C_('pig', pig, 'pig; grazes when idle');
C_('walker', walker, 'walking person; variants: n for varied clothes; behavior path for streets', 'ground', { variants: 3 });
C_('bird', bird, 'flying gull; behavior flock / circle', 'air');
C_('butterfly', butterfly, 'butterfly; behavior wander + altitude [1, 4] (or circle)', 'air', { behavior: 'wander', altitude: [1.5, 4], variants: 3 });
C_('duck', duck, 'duck on water; { baby: true } + behavior follow, target: mum → ducklings', 'water');
C_('fish', fish, 'koi just under the water surface', 'water');
