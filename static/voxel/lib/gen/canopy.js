// Rainforest canopy & sky creatures (Khao Sok): gibbons that brachiate through the trees, langurs, hornbills,
// kingfishers, bats, birdwing butterflies, dragonflies… Rig factories for stage.actors(), registered by name.
// Conventions: see creatures.js and docs/animation.md (rig space: feet at y = 0, facing +z).
//
//   stage.actors({ creature: 'gibbon', count: 3, variants: 2, behavior: 'path', path: [[x, y, z], …] });   // y = hand-hold line
//   stage.actors({ creature: 'langur', behavior: 'still', spots: [[x, branchTop, z, headingDeg], …] });     // sits, tail dangling
//   stage.actors({ creature: 'hornbill', count: 2, behavior: 'hop', spots: treeTops, arc: 0.3 });           // tree to tree
//   stage.actors({ creature: 'kingfisher', behavior: 'hop', spots: riverPerches, arc: -0.15 });             // darts low
//   stage.actors({ creature: 'bat', count: 20, behavior: 'path', loop: 'restart', path: caveOut, spread: [0.5, 6], wobble: 1 });
//
// Several rigs pose whole joint chains (body → head/legs/wings) with part.animate → { matrix }: see about()/chain().
import * as THREE from '../three.js';
import { VoxelGrid } from '../grid.js';
import '../shapes.js';
import { Palette } from '../palette.js';
import { rng } from '../random.js';
import { shade } from '../color.js';
import { rig } from '../actors.js';
import { defineCreature } from '../registry.js';
import { quadruped } from './creatures.js';
import { NATURE } from './nature.js';

const TAU = Math.PI * 2;
const _e = new THREE.Euler(), _v = new THREE.Vector3(), _t = new THREE.Matrix4();
/** out = rotation (Euler XYZ, radians) about rig-space point p. */
function about(out, p, rx = 0, ry = 0, rz = 0) {
  out.makeRotationFromEuler(_e.set(rx, ry, rz));
  _v.set(p[0], p[1], p[2]).applyMatrix4(out);
  return out.setPosition(p[0] - _v.x, p[1] - _v.y, p[2] - _v.z);
}
/** out = parent · (rotation about p): a joint riding on its parent part. */
const chain = (out, parent, p, rx, ry, rz) => about(out, p, rx, ry, rz).premultiply(parent);
/** Compute a pose once per agent per frame (every part's animate calls it; the first call does the work). */
function memo(fn) {
  let ag = null, t = NaN, ph = NaN, r = null;
  return (c) => { if (c.agent !== ag || c.t !== t || c.phase !== ph) { ag = c.agent; t = c.t; ph = c.phase; r = fn(c); } return r; };
}
const mats = (...names) => Object.fromEntries(names.map((n) => [n, new THREE.Matrix4()]));
const smooth = (x) => x * x * (3 - 2 * x);

// ---- gibbon ----------------------------------------------------------------------------------------------

const GIBBON_COATS = {
  black: { fur: '#2c2623', fur2: '#211c1a', face: '#141010', ring: '#eeeae0', hand: '#eeeae0' },
  buff: { fur: '#dcb47c', fur2: '#c49a62', face: '#2a201b', ring: '#f8f2e4', hand: '#f8f2e4' },
};

/**
 * White-handed (lar) gibbon: very long arms, small round body, no tail, white ring around a dark face, white
 * hands and feet. Brachiates: behavior 'path' with 3D points — y is the HAND-HOLD line (the underside of the
 * branches it swings along) and the rig hangs below it (≈ 7 world voxels hands-to-feet at scale 0.5), swinging
 * hand over hand like a pendulum, one full cycle every ~8.5 voxels. 'still' + spots: hangs by one arm from the
 * spot's y (pose 'hang'), or sits with y = the branch top, long arms dangling (pose 'sit'). On the ground
 * ('wander', no explicit y) it walks upright with its arms raised.
 * opts: coat ('black' | 'buff' | { fur, fur2, face, ring, hand }; random per seed), pose ('hang' | 'sit'),
 * scale (0.4), speed ([4.5, 6.5] voxels/s), seed.
 */
export function gibbon(o = {}) {
  const R = rng(o.seed ?? 1);
  const c = typeof o.coat === 'object' ? o.coat : GIBBON_COATS[o.coat ?? (R() < 0.55 ? 'black' : 'buff')] ?? GIBBON_COATS.black;
  const P = new Palette({
    fur: { color: c.fur, jitter: 0.05 }, fur2: { color: c.fur2 ?? shade(c.fur, -0.1), jitter: 0.04 },
    face: { color: c.face ?? '#141010', jitter: 0.02, roughness: 0.5 }, ring: { color: c.ring ?? '#eeeae0', jitter: 0.02 },
    hand: { color: c.hand ?? c.ring ?? '#eeeae0', jitter: 0.03 },
  });
  return o.pose === 'sit' ? gibbonSit(P, o) : gibbonHang(P, o);
}

// head 4 wide × 3 tall × 3 deep (+ face layer): a white ring (brow + cheeks) framing the dark face and muzzle
function gibbonHead(g, y0, z0) {
  g.box([0, y0, z0], [3, y0 + 2, z0 + 2], 'fur');
  g.box([0, y0 + 2, z0], [3, y0 + 2, z0 + 1], 'fur2');           // crown
  g.box([0, y0, z0 + 3], [3, y0 + 2, z0 + 3], 'ring');
  g.box([1, y0, z0 + 3], [2, y0 + 1, z0 + 3], 'face');
  g.set(0, y0, z0 + 3, 'fur'); g.set(3, y0, z0 + 3, 'fur');
  g.box([1, y0, z0 + 4], [2, y0, z0 + 4], 'face');                // muzzle
  return g;
}
// round little torso 4 × h × 3 (vertical edges shaved)
function gibbonTorso(g, y0, h) {
  g.box([0, y0, 0], [3, y0 + h - 1, 2], 'fur');
  for (const [x, z] of [[0, 0], [3, 0], [0, 2], [3, 2]]) g.box([x, y0, z], [x, y0 + h - 1, z], 0);
  g.box([1, y0, 2], [2, y0 + 1, 2], 'fur2');
  return g;
}

function gibbonHang(P, o) {
  const part = () => new VoxelGrid(P);
  const GRIP = 19, A0 = 0.6;                                      // hand-hold line (rig y), swing half-angle
  const SH = { armL: [-0.5, 8.5, 1.5], armR: [4.5, 8.5, 1.5] }, C = [2, 8.5, 1.5], NECK = [2, 9, 1.5], HIP = { legL: [0.5, 4, 1.5], legR: [3.5, 4, 1.5] };
  const LA = GRIP - SH.armL[1];                                   // shoulder → grip
  const body = gibbonTorso(part(), 4, 5);
  const head = gibbonHead(part(), 9, 0);
  const legs = [[-1, 0, 'legL'], [1, 3, 'legR']].map(([side, x, name]) => {     // flexed: thigh forward, shin down
    const g = part().box([x, 3, 1], [x, 3, 2], 'fur');
    g.box([x, 1, 2], [x, 2, 2], 'fur'); g.box([x, 0, 2], [x, 0, 3], 'hand');
    return { name, role: 'leg', side, pair: 0, grid: g, pivot: HIP[name] };
  });
  const arms = [[-1, -1, 'armL'], [1, 4, 'armR']].map(([side, x, name]) => {
    const g = part().box([x, 8, 1], [x, GRIP - 3, 1], 'fur');
    g.box([x, GRIP - 2, 1], [x, GRIP - 1, 1], 'hand');
    return { name, role: 'arm', side, grid: g, pivot: SH[name] };
  });
  const M = mats('body', 'head', 'legL', 'legR', 'armL', 'armR'), B = new THREE.Matrix4(), G = new THREE.Matrix4();
  const sh = new THREE.Vector3();
  const armAt = (name, rx, rz) => { // the arm swings about its shoulder (world-vertical frame), which rides on the body
    const S = SH[name];
    sh.set(S[0], S[1], S[2]).applyMatrix4(B);
    const m = about(M[name], S, rx, 0, rz);
    m.elements[12] += sh.x - S[0]; m.elements[13] += sh.y - S[1]; m.elements[14] += sh.z - S[2];
    return m;
  };
  const pose = memo((k) => {
    if (!k.hang) return null; // on the ground: walk upright (role defaults, arms held up in a V)
    const ag = k.agent, t = k.t, s = ag.s;
    if (k.moving > 0.3) {
      // brachiation: the grip hand stays put on the branch while the body swings under it like a pendulum;
      // the free arm swings forward (reaching out to the side, under the branch) and takes the next hold
      const ph = ((k.phase % TAU) + TAU) % TAU, gripL = ph < Math.PI, f = (ph % Math.PI) / Math.PI;
      const ga = A0 * (1 - 2 * f), fa = -A0 + 2 * A0 * f, reach = Math.sin(Math.PI * f) * 0.55;
      const dy = LA * (1 - Math.cos(ga)), tilt = ga * 0.8, roll = 0.2 * Math.sin(ph);
      about(B, C, tilt, 0, roll); B.elements[13] += dy;
      M.body.copy(B);
      chain(M.head, B, NECK, -tilt * 0.7 + 0.1, Math.sin(t * 0.7 + s * 20) * 0.25, -roll);
      chain(M.legL, B, HIP.legL, 0.35 + 0.3 * Math.sin(ph * 2 + 0.6), 0, 0.1);
      chain(M.legR, B, HIP.legR, 0.35 + 0.3 * Math.sin(ph * 2 + 1.4), 0, -0.1);
      armAt('armL', gripL ? ga : fa, gripL ? 0 : reach);
      armAt('armR', gripL ? fa : ga, gripL ? -reach : 0);
      return M;
    }
    // resting: hangs by one arm, body swung under the hand, the other arm dangling, legs idly kicking
    const left = s < 0.5, sg = left ? -1 : 1, grip = left ? 'armL' : 'armR', free = left ? 'armR' : 'armL';
    const sway = Math.sin(t * 1.1 + s * 20) * 0.1, H = [SH[grip][0], GRIP, SH[grip][2]];
    about(G, H, sway, 0, sg * 0.1);
    B.copy(G).multiply(about(M.body, SH[grip], 0, 0, sg * 0.4));
    M.body.copy(B);
    chain(M.head, B, NECK, 0.1 + Math.sin(t * 0.5 + s * 9) * 0.15, Math.sin(t * 0.6 + s * 30) * 0.6, -sg * 0.3);
    chain(M.legL, B, HIP.legL, 0.2 + Math.sin(t * 1.3 + s * 5) * 0.2, 0, -sg * 0.3);
    chain(M.legR, B, HIP.legR, 0.2 + Math.sin(t * 1.3 + s * 5 + 2) * 0.2, 0, -sg * 0.3);
    M[grip].copy(G);
    armAt(free, Math.PI - 0.3 + Math.sin(t * 0.9 + s * 7) * 0.12, sg * 0.25);
    return M;
  });
  const anim = (name, ground) => (k) => pose(k)?.[name] ? { matrix: pose(k)[name] } : ground?.(k);
  const up = (side) => (k) => ({ rx: k.rx * 0.4, rz: -side * (0.45 + Math.sin(k.t * 1.7 + k.agent.s * 9 + side) * 0.08) }); // arms up in a V
  return rig([
    { name: 'body', role: 'body', grid: body, animate: anim('body') },
    { name: 'head', role: 'head', grid: head, pivot: NECK, animate: anim('head') },
    ...legs.map((l) => ({ ...l, animate: anim(l.name) })),
    ...arms.map((a) => ({ ...a, animate: anim(a.name, up(a.side)) })),
  ], { palette: P, scale: o.scale ?? 0.4, speed: o.speed ?? [4.5, 6.5], stride: 4 * LA * Math.sin(A0), hang: GRIP, center: [2, 0, 1.5],
    idle: [1, 4], anim: { legSwing: 0.6, armSwing: 0.15, bob: 0.25, headNod: 0.05 } });
}

function gibbonSit(P, o) {
  const part = () => new VoxelGrid(P);
  const S = 6; // seat (rig y of the branch top); the long arms dangle below it to y = 0
  const body = gibbonTorso(part(), S, 5);
  for (const x of [0, 3]) { body.box([x, S, 3], [x, S + 2, 3], 'fur'); body.set(x, S, 4, 'hand'); }   // knees drawn up, white feet
  const head = gibbonHead(part(), S + 5, 0);
  const arms = [[-1, -1], [1, 4]].map(([side, x]) => {
    const g = part().box([x, 2, 1], [x, S + 4, 1], 'fur');
    g.box([x, 0, 1], [x, 1, 1], 'hand');
    return { name: side < 0 ? 'armL' : 'armR', role: 'arm', side, grid: g, pivot: [x + 0.5, S + 4.5, 1.5],
      animate: ({ t, agent }) => ({ rx: Math.sin(t * 0.8 + agent.s * 11 + side) * 0.1 - 0.15, rz: side * 0.1 }) };
  });
  return rig([{ name: 'body', role: 'static', grid: body }, { name: 'head', role: 'head', grid: head, pivot: [2, S + 5, 1.5] }, ...arms],
    { palette: P, scale: o.scale ?? 0.4, speed: o.speed ?? [1, 2], hang: S, center: [2, 0, 1.5], idle: [2, 6], anim: { headNod: 0.05 } });
}

// ---- dusky langur ----------------------------------------------------------------------------------------

/**
 * Dusky (spectacled) langur: dark grey, white rings around the eyes, pale mouth, a long tail. Default pose
 * 'sit' — for 'still' + spots [x, y, z, heading] with y = the branch top (it sits on it, tail dangling below;
 * the seat is the rig's anchor). pose: 'walk' → on all fours (wander / path along branches).
 * opts: pose ('sit' | 'walk'), fur, fur2, pale, scale (0.4; walk 0.45), seed.
 */
export function langur(o = {}) {
  const fur = o.fur ?? '#50525a', fur2 = o.fur2 ?? '#393a40', pale = o.pale ?? '#a6a8ac';
  if (o.pose === 'walk') {
    return quadruped({ coat: { fur, fur2, belly: pale, paw: '#26262a', eye: '#f0eee8', nose: '#d8cfc0', pattern: 'solid' },
      width: 3, length: 7, legH: 3, bodyH: 2, headW: 3, headH: 3, headD: 2, neck: 1, ears: 'none', tail: 'long', scale: o.scale ?? 0.45,
      speed: o.speed ?? [1.6, 2.8], stride: 4, idle: [1, 4], anim: { legSwing: 0.6, tailSway: 0.2, tailLift: 0.2 }, seed: o.seed });
  }
  const P = new Palette({
    fur: { color: fur, jitter: 0.05 }, fur2: { color: fur2, jitter: 0.04 }, pale: { color: pale, jitter: 0.04 },
    face: { color: '#232328', jitter: 0.02 }, ring: { color: '#f4f2ec', jitter: 0.02 }, mouth: { color: '#e4dacb', jitter: 0.02 },
    hand: { color: '#202024', jitter: 0.02 }, eye: { color: '#120f0e', roughness: 0.2 },
  });
  const part = () => new VoxelGrid(P);
  const S = 12; // seat height in rig space (the tail hangs below it down to y = 0)
  const body = part();
  body.box([0, S, -1], [4, S + 1, 3], 'fur');                 // haunches
  body.box([0, S + 2, -1], [4, S + 4, 2], 'fur');             // back
  for (const [x, z] of [[0, -1], [4, -1]]) body.box([x, S, z], [x, S + 4, z], 0);   // rounded rump
  body.box([1, S + 2, 3], [3, S + 4, 3], 'pale');             // chest
  body.box([0, S + 5, 0], [4, S + 5, 3], 'fur2');             // hunched shoulders
  body.box([1, S + 4, -1], [3, S + 5, -1], 'fur2');
  for (const x of [0, 4]) { body.box([x, S, 4], [x, S + 2, 4], 'fur'); body.box([x, S, 5], [x, S, 6], 'hand'); }   // knees up, feet
  body.box([1, S, 4], [3, S, 5], 'pale');                      // inner thighs / lap
  const head = part();
  head.box([0, S + 6, 1], [4, S + 9, 4], 'fur');
  head.box([1, S + 10, 2], [3, S + 10, 3], 'fur'); head.set(2, S + 10, 1, 'fur');   // crown crest
  // the face: two white "spectacles" around dark eyes, dark skin, a pale mouth
  head.ascii([0, S + 9, 5], `
    fffff
    RRkRR
    RekeR
    kkMkk`, { f: 'fur', R: 'ring', k: 'face', e: 'eye', M: 'mouth' }, { plane: 'xy' });
  head.box([1, S + 6, 6], [3, S + 6, 6], 'mouth'); head.set(2, S + 7, 6, 'face');     // muzzle + nose
  const arms = [[-1, -1], [1, 5]].map(([side, x]) => {
    const g = part();
    g.box([x, S + 3, 2], [x, S + 5, 2], 'fur'); g.box([x, S + 2, 3], [x, S + 2, 4], 'fur'); g.set(x, S + 2, 5, 'hand');
    return { name: side < 0 ? 'armL' : 'armR', role: 'arm', side, grid: g, pivot: [x + 0.5, S + 5.5, 2.5],
      // now and then one hand goes up to the mouth (feeding on leaves)
      animate: ({ t, agent }) => { const feed = side * (agent.s < 0.5 ? 1 : -1) > 0 ? smooth(Math.max(0, Math.sin(t * 0.45 + agent.s * 20) * 2 - 1)) : 0; return { rx: -feed * 1.3, rz: side * feed * 0.35 }; } };
  });
  const tail = part(); // from the rump back and down, dangling below the branch to y = 0 (an S-curve, face-connected)
  const tv = [[S, -2], [S, -3], [S - 1, -3], [S - 2, -3], [S - 3, -3], [S - 4, -3], [S - 5, -3], [S - 5, -2], [S - 6, -2], [S - 7, -2], [S - 8, -2], [S - 9, -2], [S - 10, -2], [S - 11, -2], [S - 12, -2]];
  tv.forEach(([y, z], i) => tail.set(2, y, z, i >= tv.length - 3 ? 'fur2' : 'fur'));
  return rig([{ name: 'body', role: 'static', grid: body }, { name: 'head', role: 'head', grid: head, pivot: [2.5, S + 6, 2.5] }, ...arms,
    { name: 'tail', role: 'tail', grid: tail, pivot: [2.5, S + 0.5, -1.5],
      animate: ({ t, agent }) => ({ rx: Math.sin(t * 0.7 + agent.s * 13) * 0.07, rz: Math.sin(t * 0.9 + agent.s * 7) * 0.09 }) }],
  { palette: P, scale: o.scale ?? 0.4, speed: o.speed ?? [1, 2], hang: S, center: [2.5, 0, 1.5], idle: [2, 6], anim: { headNod: 0.05 } });
}

// ---- perching birds: shared posture (pitch up + tail down when perched, legs tucked in flight) -------------

/**
 * Animate functions for a bird whose body pitches nose-up by `perch` radians about `hip` when perched
 * (air → 0) and flies level (air → 1); wings keep their role flap/fold, the tail droops, legs tuck in flight.
 */
function birdPosture({ hip, perch = 0.45, tailDroop = 0.5, headLevel = 0.6, tuck = 1.4 }) {
  const Pm = new THREE.Matrix4(), out = new Map();
  const body = memo((k) => about(Pm, hip, -perch * (1 - k.air), 0, 0));
  const m = (name) => out.get(name) ?? out.set(name, new THREE.Matrix4()).get(name);
  return {
    body: (name) => (k) => ({ matrix: m(name).copy(body(k)) }),
    wing: (name, pivot) => (k) => ({ matrix: chain(m(name), body(k), pivot, k.rx, k.ry, k.rz) }),
    head: (name, pivot) => (k) => ({ matrix: chain(m(name), body(k), pivot, k.rx + perch * headLevel * (1 - k.air), k.ry, 0) }),
    tail: (name, pivot) => (k) => ({ matrix: chain(m(name), body(k), pivot, -tailDroop * (1 - k.air) + Math.sin(k.t * 1.3 + k.agent.s * 9) * 0.05, k.ry * 0.5, 0) }),
    leg: (name, pivot) => (k) => ({ matrix: chain(m(name), body(k), pivot, tuck * k.air + perch * (1 - k.air), 0, 0) }),
  };
}

// ---- great hornbill --------------------------------------------------------------------------------------

/**
 * Great hornbill: black wings with a white bar and white trailing edge, cream neck, white tail with a black
 * band, an enormous yellow-orange bill topped by a casque. Wingspan ~9 world voxels (scale 0.45). Fliers: slow
 * heavy wingbeats with glides (flock / circle / path); perches upright, tail hanging, wings folded ('still' /
 * 'hop' + spots, y = the branch top). opts: eye ('#d8402a' male | white female), scale (0.45), speed, seed.
 */
export function hornbill(o = {}) {
  const R = rng(o.seed ?? 1);
  const P = new Palette({
    black: { color: '#1d1b1e', jitter: 0.04 }, black2: { color: '#2a272b', jitter: 0.04 },
    white: { color: '#f2eedf', jitter: 0.03 }, neck: { color: '#efe0a8', jitter: 0.04 },
    bill: { color: '#f4c23a', jitter: 0.03, roughness: 0.45 }, bill2: { color: '#eea030', jitter: 0.03, roughness: 0.45 },
    casque: { color: '#f8d04a', jitter: 0.03, roughness: 0.4 }, tip: { color: '#f6ead0', jitter: 0.02 },
    eye: { color: o.eye ?? (R() < 0.5 ? '#d8402a' : '#f2f0e8'), jitter: 0, roughness: 0.2 }, leg: { color: '#4a4a50', jitter: 0.03 },
  });
  const part = () => new VoxelGrid(P);
  const body = part();
  body.box([0, 1, 0], [3, 3, 5], 'black');
  body.box([0, 1, 0], [3, 1, 1], 'white');                     // white belly / vent
  body.box([0, 3, 1], [3, 3, 3], 'black2');                    // back sheen
  body.box([0, 2, 6], [3, 4, 6], 'neck');                      // cream collar
  const head = part();
  head.box([0, 3, 7], [3, 5, 8], 'black');
  head.box([0, 5, 7], [3, 5, 7], 'neck');                      // cream nape
  head.set(0, 4, 8, 'eye'); head.set(3, 4, 8, 'eye');
  head.box([1, 4, 9], [2, 4, 11], 'bill');                     // the huge bill, curving down…
  head.box([1, 3, 9], [2, 3, 12], 'bill2');
  head.box([1, 2, 12], [2, 2, 12], 'bill2'); head.box([1, 2, 13], [2, 2, 13], 'tip');
  head.box([1, 5, 8], [2, 5, 11], 'casque'); head.box([1, 6, 8], [2, 6, 8], 'casque'); head.box([1, 6, 11], [2, 6, 11], 'casque'); // …under its casque
  head.box([1, 4, 12], [2, 5, 12], 'bill2');                   // casque front
  const tail = part();
  tail.box([0, 2, -1], [3, 2, -1], 'white'); tail.box([0, 2, -2], [3, 2, -3], 'black'); tail.box([0, 2, -4], [3, 2, -5], 'white');
  tail.box([-1, 2, -5], [-1, 2, -5], 'white'); tail.box([4, 2, -5], [4, 2, -5], 'white');       // slightly fanned
  const wings = [-1, 1].map((side) => {
    const g = part();
    const rows = { 4: 'black', 3: 'white', 2: 'black', 1: 'black', 0: 'white' };   // coverts, white bar, flight feathers, white tips
    for (let k = 0; k < 8; k++) {
      const x = side > 0 ? 4 + k : -1 - k;
      for (let z = 0; z <= 4; z++) {
        if ((k === 7 && (z === 4 || z === 0)) || (k === 6 && z === 4)) continue;   // rounded, fingered tip
        g.set(x, 2, z, k >= 6 && z === 3 ? 'black' : rows[z]);
      }
      if (k < 3) g.set(x, 2, 5, 'black');                       // broad inner wing
    }
    return { name: side < 0 ? 'wingL' : 'wingR', role: 'wing', side, grid: g, pivot: [side < 0 ? 0 : 4, 2.5, 2.5] };
  });
  const legs = [[-1, 1], [1, 2]].map(([side, x]) => ({ name: side < 0 ? 'legL' : 'legR', side, grid: part().box([x, 0, 2], [x, 0, 2], 'leg'), pivot: [x + 0.5, 1, 2.5] }));
  const B = birdPosture({ hip: [2, 1, 2.5], perch: 0.7, tailDroop: 0.12, headLevel: 0.75 });
  return rig([
    { name: 'body', role: 'body', grid: body, animate: B.body('body') },
    { name: 'head', role: 'head', grid: head, pivot: [2, 3.5, 6.5], animate: B.head('head', [2, 3.5, 6.5]) },
    { name: 'tail', role: 'tail', grid: tail, pivot: [2, 2.5, -0.5], animate: B.tail('tail', [2, 2.5, -0.5]) },
    ...wings.map((w) => ({ ...w, animate: B.wing(w.name, w.pivot) })),
    ...legs.map((l) => ({ ...l, role: 'static', animate: B.leg(l.name, l.pivot) })),
  ], { palette: P, fly: true, scale: o.scale ?? 0.45, speed: o.speed ?? [4.5, 6.5], idle: o.idle ?? [3, 8], center: [2, 0, 2.5],
    anim: { flap: 0.55, flapSpeed: 4.2, glide: 0.5, headNod: 0.04, fold: { rx: 0.05, ry: 1.45, rz: 0.25 }, ...(o.anim ?? {}) } });
}

// ---- kingfisher ------------------------------------------------------------------------------------------

/**
 * Kingfisher: tiny and jewel-bright — electric blue back and wings, orange belly and cheeks, white throat, a
 * long dark bill, red feet. Fast whirring flight; made for 'hop' between perches (river stakes, snags, boat
 * prows: spots with y = the perch top; `arc: -0.15` dips toward the water). ~3 voxels long.
 * opts: blue, cyan, orange (colors), scale (0.28), speed, seed.
 */
export function kingfisher(o = {}) {
  const P = new Palette({
    blue: { color: o.blue ?? '#1f86d0', jitter: 0.04, roughness: 0.4 }, cyan: { color: o.cyan ?? '#38d4f2', jitter: 0.03, roughness: 0.35, emissive: 0.15 },
    deep: { color: '#185a96', jitter: 0.04 }, orange: { color: o.orange ?? '#f0742a', jitter: 0.03 }, white: { color: '#f4f0e6', jitter: 0.02 },
    bill: { color: '#1e1a1c', jitter: 0.02, roughness: 0.4 }, eye: { color: '#0e0e10', roughness: 0.2 }, foot: { color: '#e8483a', jitter: 0 },
  });
  const part = () => new VoxelGrid(P);
  const body = part();
  body.box([0, 1, 0], [2, 2, 2], 'blue');
  body.box([0, 1, 0], [2, 1, 2], 'orange');                   // belly
  body.box([1, 2, 0], [1, 2, 2], 'cyan');                     // the electric streak down the back
  const head = part();                                          // a big head: blue crown, orange cheeks, white throat + neck patch
  head.box([0, 2, 3], [2, 3, 5], 'blue');
  head.box([0, 2, 3], [2, 2, 5], 'orange');
  head.set(0, 2, 3, 'white'); head.set(2, 2, 3, 'white'); head.set(1, 2, 5, 'white');
  head.set(0, 3, 4, 'eye'); head.set(2, 3, 4, 'eye');
  head.box([1, 2, 6], [1, 2, 8], 'bill'); head.set(1, 3, 6, 'bill');   // long dagger bill
  const tail = part().box([1, 2, -1], [1, 2, -2], 'deep');
  tail.set(0, 2, -1, 'deep'); tail.set(2, 2, -1, 'deep');
  const wings = [-1, 1].map((side) => {
    const g = part(), x0 = side < 0 ? -3 : 3, x1 = side < 0 ? -1 : 5;
    g.box([x0, 2, 0], [x1, 2, 2], 'deep');
    g.box([x0, 2, 2], [x1, 2, 2], 'blue');
    g.set(side < 0 ? -1 : 3, 2, 1, 'cyan');
    g.set(side < 0 ? -3 : 5, 2, 0, 0);
    return { name: side < 0 ? 'wingL' : 'wingR', role: 'wing', side, grid: g, pivot: [side < 0 ? 0 : 3, 2.5, 1.5] };
  });
  const legs = [[-1, 0], [1, 2]].map(([side, x]) => ({ name: side < 0 ? 'legL' : 'legR', side, grid: part().box([x, 0, 1], [x, 0, 1], 'foot'), pivot: [x + 0.5, 1, 1.5] }));
  const B = birdPosture({ hip: [1.5, 1, 1.5], perch: 0.95, tailDroop: 0.35, headLevel: 0.85 });
  return rig([
    { name: 'body', role: 'body', grid: body, animate: B.body('body') },
    { name: 'head', role: 'head', grid: head, pivot: [1.5, 2.5, 3], animate: B.head('head', [1.5, 2.5, 3]) },
    { name: 'tail', role: 'tail', grid: tail, pivot: [1.5, 2.5, -0.5], animate: B.tail('tail', [1.5, 2.5, -0.5]) },
    ...wings.map((w) => ({ ...w, animate: B.wing(w.name, w.pivot) })),
    ...legs.map((l) => ({ ...l, role: 'static', animate: B.leg(l.name, l.pivot) })),
  ], { palette: P, fly: true, scale: o.scale ?? 0.28, speed: o.speed ?? [6, 9], idle: o.idle ?? [1.5, 5], center: [1.5, 0, 1.5],
    anim: { flap: 0.75, flapSpeed: 26, glide: 0, headNod: 0.06, fold: { rx: 0.1, ry: 1.35, rz: 0.15 }, ...(o.anim ?? {}) } });
}

// ---- bat -------------------------------------------------------------------------------------------------

/**
 * Bat: small dark cave bat (kind 'cave', ~3 voxel wingspan) or a flying fox with a russet mantle and amber eyes
 * (kind 'fox', ~5), membranous scalloped wings, fast deep wingbeats. Flocks (behavior 'flock' + wobble), streams (behavior 'path', loop
 * 'restart', spread [0.5, 6], wobble 1 — out of a cave mouth and dispersing). Perched ('still' / 'hop' + spots,
 * y = the underside of a ceiling or branch) it hangs head down, wings wrapped. opts: kind, scale, speed, seed.
 */
export function bat(o = {}) {
  const fox = o.kind === 'fox';
  const P = new Palette({
    fur: { color: fox ? '#3a2a24' : '#2c2424', jitter: 0.05 }, mantle: { color: fox ? '#9a5e30' : '#4a3a34', jitter: 0.05 },
    skin: { color: fox ? '#2e2220' : '#262022', jitter: 0.04, roughness: 0.6 }, bone: { color: fox ? '#4e3c34' : '#3e3434', jitter: 0.03 },
    eye: { color: '#d8a040', jitter: 0, emissive: 0.6 },
  });
  const part = () => new VoxelGrid(P);
  const body = part();
  body.box([0, 0, -1], [1, 1, 2], 'fur');
  body.box([0, 1, 1], [1, 1, 2], 'mantle');
  const head = part();
  head.box([0, 0, 3], [1, 1, 3], fox ? 'mantle' : 'fur');
  if (fox) { head.box([0, 0, 4], [1, 0, 4], 'mantle'); head.set(0, 1, 4, 'eye'); head.set(1, 1, 4, 'eye'); }
  head.set(0, 2, 3, 'skin'); head.set(1, 2, 3, 'skin');       // ears
  // wing from above: bony leading edge out to the wrist and the tip, scalloped trailing edge between the fingers
  const pic = [
    '..BB...',
    'BBSSBB.',
    'SSSSSSB',
    'SSSSS..',
    'S..S...',
  ];
  const wings = [-1, 1].map((side) => {
    const g = part();
    pic.forEach((row, r) => [...row].forEach((ch, k) => { if (ch !== '.') g.set(side > 0 ? 2 + k : -1 - k, 1, 2 - r, ch === 'B' ? 'bone' : 'skin'); }));
    return { name: side < 0 ? 'wingL' : 'wingR', role: 'wing', side, grid: g, pivot: [side < 0 ? 0 : 2, 1.5, 0.5] };
  });
  // perched: hang head-down from the feet (rear top of the body), wings wrapped
  const F = [1, 2, -1], Pm = new THREE.Matrix4(), M = mats('body', 'head', 'wingL', 'wingR');
  const hang = memo((k) => { const a = 1 - k.air; about(Pm, F, (Math.PI / 2) * a, 0, 0); Pm.elements[13] -= 2 * a; return Pm; });
  return rig([
    { name: 'body', role: 'body', grid: body, animate: (k) => ({ matrix: M.body.copy(hang(k)) }) },
    { name: 'head', role: 'head', grid: head, pivot: [1, 0.5, 3], animate: (k) => ({ matrix: chain(M.head, hang(k), [1, 0.5, 3], k.rx * 0.5, k.ry * 0.6, 0) }) },
    ...wings.map((w) => ({ ...w, animate: (k) => ({ matrix: chain(M[w.name], hang(k), w.pivot, k.rx, k.ry, k.rz) }) })),
  ], { palette: P, fly: true, scale: o.scale ?? (fox ? 0.3 : 0.2), speed: o.speed ?? (fox ? [4, 6] : [5, 8]), idle: o.idle ?? [2, 6], center: [1, 0, 0.5],
    anim: { flap: 1.0, flapSpeed: fox ? 8 : 15, glide: fox ? 0.25 : 0, fold: { rx: 0, ry: 0.3, rz: -1.4 }, ...(o.anim ?? {}) } });
}

// ---- birdwing butterfly ----------------------------------------------------------------------------------

const BIRDWINGS = {
  golden: { fore: '#1c1a1a', vein: '#6a6866', hind: '#f2c21e', hind2: '#1c1a1a', body: '#1a1818', belly: '#f0c030' },   // Troides
  rajah: { fore: '#141616', vein: '#3ee08a', hind: '#141616', hind2: '#2ad07a', body: '#141414', belly: '#c83a30' },    // Rajah Brooke's
};
/**
 * Birdwing butterfly (big: ~2.6 voxel wingspan): kind 'golden' (black forewings with pale veins, golden hindwings)
 * or 'rajah' (black with emerald bands, red collar), or { fore, vein, hind, hind2, body, belly } colors. Slow,
 * graceful flaps with glides; wings closed upright when perched (still / hop + spots on flowers).
 * opts: kind (random per seed), scale (0.2), speed, seed.
 */
export function birdwing(o = {}) {
  const R = rng(o.seed ?? 1);
  const c = typeof o.kind === 'object' ? o.kind : BIRDWINGS[o.kind ?? (R() < 0.7 ? 'golden' : 'rajah')] ?? BIRDWINGS.golden;
  const P = new Palette({
    fore: { color: c.fore, jitter: 0.03 }, vein: { color: c.vein, jitter: 0.03, emissive: c.vein === BIRDWINGS.rajah.vein ? 0.25 : 0 },
    hind: { color: c.hind, jitter: 0.04, emissive: 0.08 }, hind2: { color: c.hind2, jitter: 0.03 },
    body: { color: c.body, jitter: 0.02 }, belly: { color: c.belly, jitter: 0.03 },
  });
  const part = () => new VoxelGrid(P);
  const body = part().box([0, 0, -1], [0, 0, 1], 'belly');
  body.box([0, 0, 2], [0, 0, 3], 'body'); body.set(0, 0, 4, 'body');
  body.set(0, 1, 5, 'body');                                     // antenna
  // wing pictures, rows from the front (z = 5) back to z = −2; cols outward from the body (x = 1…6)
  const pic = [
    'FFFF..',
    'FFVFFF',
    'FFFVFF',
    'FFFFF.',
    'HHHHh.',
    'HHHhh.',
    'HHHh..',
    'hHh...',
  ];
  const wings = [-1, 1].map((side) => {
    const g = part();
    pic.forEach((row, r) => [...row].forEach((ch, k) => {
      const m = { F: 'fore', V: 'vein', H: 'hind', h: 'hind2' }[ch];
      if (m) g.set(side > 0 ? 1 + k : -1 - k, 0, 5 - r, m);
    }));
    return { name: side < 0 ? 'wingL' : 'wingR', role: 'wing', side, grid: g, pivot: [side < 0 ? 0 : 1, 0.5, 1.5] };
  });
  return rig([{ name: 'body', role: 'body', grid: body }, ...wings], { palette: P, fly: true, scale: o.scale ?? 0.2, speed: o.speed ?? [1.2, 2.2],
    idle: o.idle ?? [1.5, 4], anim: { flap: 1.05, flapSpeed: 5.5, glide: 0.35, fold: { rx: 0, ry: 0.1, rz: 1.45 }, ...(o.anim ?? {}) } });
}

// ---- dragonfly -------------------------------------------------------------------------------------------

/**
 * Dragonfly: slim metallic body (color 'blue' | 'red' | '#hex'; random per seed), big eyes, four glassy wings
 * shimmering out of phase. Darts and hovers: 'wander' with altitude [0.8, 2] over water (or 'hop' between
 * reed tips — perched, wings stay flat). opts: color, scale (0.25), speed, seed.
 */
export function dragonfly(o = {}) {
  const R = rng(o.seed ?? 1);
  const col = { blue: '#2f6ee0', red: '#d8342a' }[o.color ?? (R() < 0.6 ? 'blue' : 'red')] ?? o.color;
  const P = new Palette({
    body: { color: col, jitter: 0.04, metalness: 0.45, roughness: 0.3 }, ring: { color: shade(col, -0.3), jitter: 0.03, metalness: 0.4, roughness: 0.3 },
    eye: { color: col === '#d8342a' ? '#b82820' : '#3ad0c8', jitter: 0.03, roughness: 0.2, metalness: 0.3 },
    wing: { color: '#e4f2f8', jitter: 0.02, roughness: 0.12, metalness: 0.15, emissive: 0.12 }, spot: { color: '#3a2c2c', jitter: 0 },
  });
  const part = () => new VoxelGrid(P);
  const body = part();
  for (let z = -6; z <= 0; z++) body.set(0, 1, z, z % 2 ? 'body' : 'ring');
  body.box([0, 1, 1], [0, 2, 2], 'body');
  body.box([-1, 1, 3], [1, 2, 3], 'eye'); body.set(0, 1, 3, 'body');
  const wings = [];
  for (const [fore, z0] of [[1, 2], [0, 0]]) for (const side of [-1, 1]) {
    const g = part(), X = (k) => (side > 0 ? 1 + k : -1 - k);
    for (let k = 0; k < 4; k++) { g.set(X(k), 2, z0, k === 3 ? 'spot' : 'wing'); if (!fore && k < 2) g.set(X(k), 2, z0 + 1, 'wing'); }
    wings.push({ name: `wing${fore ? 'F' : 'H'}${side < 0 ? 'L' : 'R'}`, role: 'wing', side, grid: g, pivot: [side < 0 ? 0 : 1, 2.5, z0 + 0.5],
      animate: fore ? undefined : (k) => ({ rx: k.rx, ry: k.ry, rz: -k.rz }) });       // hindwings beat out of phase
  }
  return rig([{ name: 'body', role: 'body', grid: body }, ...wings], { palette: P, fly: true, scale: o.scale ?? 0.25, speed: o.speed ?? [3, 6],
    idle: o.idle ?? [0.3, 1.6], sprint: 0.4, anim: { flap: 0.35, flapSpeed: 32, glide: 0, fold: { rx: 0, ry: 0.12, rz: 0 }, ...(o.anim ?? {}) } });
}

// ---- registry --------------------------------------------------------------------------------------------

// tiny props for the catalog examples (a branch to swing under, perch posts, reed stakes)
function prop(stage, build) {
  const g = new VoxelGrid(new Palette({ bark: NATURE.bark, barkDark: NATURE.barkDark, barkLight: NATURE.barkLight, leafDark: NATURE.leafDark, leaf: NATURE.leaf, leafLight: NATURE.leafLight }));
  build(g);
  stage.add(g, { bake: { ao: true } });
}
const crown = (g, x, y, z, r) => g.ellipsoid([x, y, z], [r, r * 0.6, r], (X, Y, Z) => (Y > y + 1 ? 'leafLight' : (X + Z) % 3 ? 'leaf' : 'leafDark'), { mode: 'keep' });

defineCreature('gibbon', gibbon, {
  summary: 'white-handed gibbon (black/buff); brachiates under branches on a 3D path (y = hand-hold line), hangs or sits on spots',
  habitat: 'air',
  example: (stage, { center: [cx, , cz] }) => {
    prop(stage, (g) => {
      for (const x of [cx - 9, cx + 8]) { g.box([x, 1, cz - 1], [x + 1, 16, cz], 'bark'); crown(g, x + 0.5, 18, cz, 3.5); }
      g.box([cx - 8, 15, cz], [cx + 7, 15, cz], 'bark');         // the branch: its underside (y = 15) is the hand-hold line
    });
    stage.actors({ creature: 'gibbon', options: { coat: 'black' }, behavior: 'path', path: [[cx - 7, 15, cz + 0.5], [cx + 2, 15, cz + 0.5]] });
    stage.actors({ creature: 'gibbon', options: { coat: 'buff' }, behavior: 'still', spots: [[cx + 5, 15, cz + 0.5, 30]], seed: 2 });   // resting, one arm
  },
});
defineCreature('langur', langur, {
  summary: 'dusky langur with white eye rings; sits on branches (still + spots, y = branch top), long tail dangling; pose walk',
  habitat: 'ground',
  example: (stage, { center: [cx, , cz] }) => {
    prop(stage, (g) => {
      for (const x of [cx - 8, cx + 7]) g.box([x, 1, cz - 1], [x + 1, 9, cz], 'bark');
      g.box([cx - 7, 8, cz], [cx + 6, 8, cz], 'bark');            // branch top at y = 9
    });
    stage.actors({ creature: 'langur', behavior: 'still', spots: [[cx - 4, 9, cz + 0.5, 15], [cx + 0.5, 9, cz + 0.5, -20], [cx + 4, 9, cz + 0.5, 40]], seed: 2 });
  },
});
defineCreature('hornbill', hornbill, {
  summary: 'great hornbill: huge casqued bill, black/white wings (~9 span); slow flaps + glides; perches on spots (hop / still)',
  habitat: 'air',
  example: (stage, { center: [cx, , cz] }) => {
    const posts = [[cx - 7, 10, cz - 5], [cx + 6, 13, cz - 3], [cx, 8, cz + 6]];
    prop(stage, (g) => posts.forEach(([x, h, z]) => { g.box([x, 1, z], [x, h, z], 'barkDark'); g.box([x - 1, h, z], [x + 1, h, z], 'barkDark'); }));
    stage.actors({ creature: 'hornbill', count: 2, behavior: 'hop', spots: posts.map(([x, h, z], i) => [x + 0.5, h + 1, z + 0.5, i * 120]), arc: 0.3, idle: [2, 4] });
  },
});
defineCreature('kingfisher', kingfisher, {
  summary: 'kingfisher: electric blue + orange, long bill; darts between perches (hop + spots, arc -0.15 dips to the water)',
  habitat: 'water',
  example: (stage, { center: [cx, , cz] }) => {
    const stakes = [[cx - 5, 3, cz - 3], [cx + 4, 4, cz - 4], [cx + 1, 3, cz + 5]];
    prop(stage, (g) => stakes.forEach(([x, h, z]) => g.box([x, -2, z], [x, h, z], 'barkDark')));
    stage.actors({ creature: 'kingfisher', count: 2, behavior: 'hop', spots: stakes.map(([x, h, z]) => [x + 0.5, h + 1, z + 0.5]), arc: -0.15, idle: [1, 3] });
  },
});
defineCreature('bat', bat, {
  summary: 'bat (cave | fox): erratic fast flaps; flock + wobble, or stream out of a cave on a path (loop restart); hangs head-down on spots',
  habitat: 'air',
  example: (stage, { center: [cx, cy, cz] }) => stage.actors({ creature: 'bat', count: 6, variants: 2, options: [{}, { kind: 'fox' }], behavior: 'flock', center: [cx, cy + 9, cz], radius: 6, wobble: 1 }),
});
defineCreature('birdwing', birdwing, {
  summary: 'big birdwing butterfly (golden | rajah); slow graceful flaps, wings closed upright when perched',
  habitat: 'air',
  example: (stage, { area }) => stage.actors({ creature: 'birdwing', count: 3, variants: 2, options: [{ kind: 'golden' }, { kind: 'rajah' }], behavior: 'wander', altitude: [1.5, 4], area }),
});
defineCreature('dragonfly', dragonfly, {
  summary: 'dragonfly (blue | red): glassy wings shimmering, darts and hovers over water (wander, altitude [0.8, 2])',
  habitat: 'water',
  example: (stage, { area }) => stage.actors({ creature: 'dragonfly', count: 4, variants: 2, options: [{ color: 'blue' }, { color: 'red' }], behavior: 'wander', altitude: [0.8, 2], area }),
});
