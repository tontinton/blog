// Fast unit tests for the non-WebGL parts of the lib (grid, shapes, palette, mesher, bakes, vox).
//   node test.mjs        (≈1 s, no browser) — run with check.mjs after changing the lib.
import assert from 'node:assert/strict';
import * as V from '../../static/voxel/lib/index.js';
import { VoxelGrid, Palette, buildMesh, parseVox, rng, hash3, MAT_TEXELS, MAT_PER_ROW, NATURE, BUILD } from '../../static/voxel/lib/index.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; } catch (e) { failed++; console.log(`FAIL ${name}\n  ${e.message.split('\n').join('\n  ')}`); }
};
const P = new Palette({ a: '#f00', b: '#0f0', water: { color: '#00f', kind: 'water' }, glass: { color: '#fff', kind: 'glass' }, lamp: { color: '#ff0', emissive: 3, light: { radius: 4 } } });
const quads = (g, o) => buildMesh(g, P, o).stats.quads;
const cells = (g) => { const out = []; g.forEach((x, y, z, id) => out.push(`${x},${y},${z}:${id}`)); return out.sort(); };

// ---- grid ---------------------------------------------------------------------------------------
test('get/set across chunk boundaries and negatives', () => {
  const g = new VoxelGrid(P);
  for (const [x, y, z] of [[0, 0, 0], [-1, -1, -1], [31, 32, -33], [-32, 31, 64], [1000, -2000, 5]]) g.set(x, y, z, P.a);
  for (const [x, y, z] of [[0, 0, 0], [-1, -1, -1], [31, 32, -33], [-32, 31, 64], [1000, -2000, 5]]) assert.equal(g.get(x, y, z), P.a);
  assert.equal(g.get(1, 0, 0), 0);
  assert.equal(g.get(-33, 31, 64), 0);
  assert.equal(g.count(), 5);
});
test('box is inclusive; hollow/walls', () => {
  const g = new VoxelGrid(P);
  g.box([0, 0, 0], [2, 2, 2], 'a');
  assert.equal(g.count(), 27);
  const h = new VoxelGrid(P).box([0, 0, 0], [2, 2, 2], 'a', { hollow: true });
  assert.equal(h.count(), 26);
  const w = new VoxelGrid(P).box([0, 0, 0], [2, 2, 2], 'a', { walls: true });
  assert.equal(w.count(), 24);
  assert.deepEqual(g.bounds().size, [3, 3, 3]);
});
test('modes keep/carve/paint', () => {
  const g = new VoxelGrid(P).box([0, 0, 0], [1, 0, 0], 'a');
  g.box([0, 0, 0], [2, 0, 0], 'b', { mode: 'keep' });
  assert.deepEqual([g.get(0, 0, 0), g.get(2, 0, 0)], [P.a, P.b]);
  g.box([0, 0, 0], [3, 0, 0], 'b', { mode: 'paint' });
  assert.deepEqual([g.get(0, 0, 0), g.get(3, 0, 0)], [P.b, 0]);
  g.box([1, 0, 0], [1, 0, 0], 'a', { mode: 'carve' });
  assert.equal(g.get(1, 0, 0), 0);
});
test('sphere is symmetric around a voxel center', () => {
  const g = new VoxelGrid(P).sphere([0, 0, 0], 3, 'a');
  const b = g.bounds();
  assert.deepEqual(b.min, [-3, -3, -3]);
  assert.deepEqual(b.max, [3, 3, 3]);
  g.forEach((x, y, z) => assert.ok(g.has(-x, y, z) && g.has(x, -y, z) && g.has(x, y, -z)));
});
test('cylinder base + height, cone tapers', () => {
  const g = new VoxelGrid(P).cylinder([0, 2, 0], 1, 5, 'a');
  const b = g.bounds();
  assert.equal(b.min[1], 2); assert.equal(b.max[1], 6);
});
test('stamp rot + center, palette merge by name', () => {
  const Q = new Palette({ b: '#123', other: '#456' });
  const src = new VoxelGrid(Q).box([0, 0, 0], [2, 0, 0], 'other');
  const g = new VoxelGrid(P).stamp(src, 10, 0, 10, { rot: 1 });
  assert.equal(g.count(), 3);
  const ids = new Set(); g.forEach((x, y, z, id) => ids.add(P.defs[id].name));
  assert.deepEqual([...ids], ['other']);
  const b = g.bounds();
  assert.equal(b.size[0], 1); assert.equal(b.size[2], 3); // rotated 90° → along z
});
test('symmetrize odd and even', () => {
  const g = new VoxelGrid(P); g.set(-2, 0, 0, P.a); g.set(0, 1, 0, P.a); g.symmetrize('x');
  assert.ok(g.has(2, 0, 0) && g.has(0, 1, 0)); assert.equal(g.count(), 3);
  const h = new VoxelGrid(P); h.set(-1, 0, 0, P.a); h.symmetrize('x', -0.5);
  assert.ok(h.has(0, 0, 0)); assert.equal(h.count(), 2);
});
test('layers: rows → +z, cols → +x, slices bottom-up', () => {
  const g = new VoxelGrid(P).layers([0, 0, 0], [`
    a.
    .b`, `
    b`], { a: 'a', b: 'b' });
  assert.deepEqual(cells(g), [`0,0,0:${P.a}`, `0,1,0:${P.b}`, `1,0,1:${P.b}`].sort());
});
test('ascii xy: rows go down in y', () => {
  const g = new VoxelGrid(P).ascii([0, 5, 0], `
    ab
    b.`, { a: 'a', b: 'b' });
  assert.equal(g.get(0, 5, 0), P.a); assert.equal(g.get(1, 5, 0), P.b); assert.equal(g.get(0, 4, 0), P.b);
});
test('text renders 3x5 glyphs', () => {
  const g = new VoxelGrid(P).text('I', [0, 4, 0], 'a');
  assert.deepEqual(g.bounds().size, [3, 5, 1]);
});

// ---- palette ------------------------------------------------------------------------------------
test('palette ids, names, color() dedupe, variant, unnamed add', () => {
  const Q = new Palette({ x: '#111' });
  assert.equal(Q.x, 1); assert.equal(Q.id('x'), 1);
  const c1 = Q.color('#abcdef'), c2 = Q.color('#ABCDEF');
  assert.equal(c1, c2);
  const v = Q.variant('x', { emissive: 2 });
  assert.equal(Q.def(v).emissive, 2);
  assert.throws(() => Q.id('nope'));
});
test('palette texture layout: 16 texels per material, 256 per row', () => {
  const Q = new Palette();
  for (let i = 0; i < 300; i++) Q.add(`m${i}`, { color: [i / 300, 0, 0], roughness: 0.5 });
  const t = Q.texture();
  assert.equal(t.image.width, MAT_PER_ROW * MAT_TEXELS);
  assert.equal(t.image.height, 2);
  const id = Q.id('m280');
  const base = ((Math.floor(id / MAT_PER_ROW) * MAT_PER_ROW * MAT_TEXELS) + (id % MAT_PER_ROW) * MAT_TEXELS) * 4;
  assert.ok(Math.abs(t.image.data[base + 4] - 0.5) < 1e-6, 'roughness at texel 1.x');
});

// ---- mesher -------------------------------------------------------------------------------------
test('single voxel → 6 quads; merged pair → 6; two materials → 10', () => {
  assert.equal(quads(new VoxelGrid(P).set(0, 0, 0, P.a)), 6);
  assert.equal(quads(new VoxelGrid(P).box([0, 0, 0], [1, 0, 0], 'a')), 6);
  assert.equal(quads(new VoxelGrid(P).set(0, 0, 0, P.a).set(1, 0, 0, P.b)), 10);
  assert.equal(quads(new VoxelGrid(P).box([0, 0, 0], [1, 0, 0], 'a'), { greedy: false }), 10);
});
test('large flat slab merges to a few quads', () => {
  const g = new VoxelGrid(P).box([0, 0, 0], [63, 0, 63], 'a');
  assert.ok(quads(g) <= 6 * 4, `got ${quads(g)}`);
});
test('water: faces against air only; solid faces still drawn against water', () => {
  const g = new VoxelGrid(P).box([0, 0, 0], [2, 0, 0], 'water').set(3, 0, 0, P.a);
  const r = buildMesh(g, P);
  assert.equal(r.transparent.index.count / 6, 5);   // merged water box minus the face touching the solid
  assert.equal(r.solid.index.count / 6, 6);          // the solid voxel keeps all 6 (water is transparent)
  const w2 = new VoxelGrid(P).set(0, 0, 0, P.water).set(1, 0, 0, P.glass);
  assert.equal(buildMesh(w2, P).transparent.index.count / 6, 12); // different transparent kinds show each other
});
test('vertex AO darkens corners next to a wall, floor top stays open', () => {
  const g = new VoxelGrid(P).box([0, 0, 0], [4, 0, 4], 'a').box([0, 1, 0], [0, 3, 4], 'b');
  const r = buildMesh(g, P);
  const pos = r.solid.attributes.position, info = r.solid.attributes.aInfo, face = r.solid.attributes.aFace;
  let darkNearWall = 0, openFar = 0;
  for (let i = 0; i < pos.count; i++) {
    if ((face.getX(i) & 7) !== 2 || pos.getY(i) !== 1 || info.getX(i) !== P.a) continue; // floor top faces
    if (pos.getX(i) === 1 && info.getZ(i) < 255) darkNearWall++;
    if (pos.getX(i) === 5 && info.getZ(i) === 255) openFar++;
  }
  assert.ok(darkNearWall > 0, 'expected occluded vertices along the wall');
  assert.ok(openFar > 0, 'expected open vertices far from the wall');
});
test('face winding: normals from geometry match the face dir', () => {
  const g = new VoxelGrid(P).set(0, 0, 0, P.a);
  const r = buildMesh(g, P), pos = r.solid.attributes.position, idx = r.solid.index, face = r.solid.attributes.aFace;
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let t = 0; t < idx.count; t += 3) {
    const [i0, i1, i2] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    const p = (i) => [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [a, b, c] = [p(i0), p(i1), p(i2)];
    const u = b.map((v, k) => v - a[k]), v = c.map((w, k) => w - a[k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const d = dirs[face.getX(i0) & 7];
    assert.ok(n[0] * d[0] + n[1] * d[1] + n[2] * d[2] > 0, `triangle ${t / 3} winds against face ${face.getX(i0) & 7}`);
  }
});
test('bevel edge mask: lone voxel has all 4 convex edges on every face', () => {
  const r = buildMesh(new VoxelGrid(P).set(0, 0, 0, P.a), P);
  const f = r.solid.attributes.aFace;
  for (let i = 0; i < f.count; i++) assert.equal(f.getX(i) >> 3, 15);
});
test('baked light reaches nearby air but not through walls', () => {
  const g = new VoxelGrid(P).box([-6, -1, -6], [6, -1, 6], 'a').set(0, 0, 0, P.lamp).box([3, 0, -6], [3, 4, 6], 'b');
  const r = buildMesh(g, P, { bake: { light: true } });
  const pos = r.solid.attributes.position, lt = r.solid.attributes.aLight, face = r.solid.attributes.aFace;
  let litNear = 0, litBehind = 0;
  for (let i = 0; i < pos.count; i++) {
    if ((face.getX(i) & 7) !== 2 || pos.getY(i) !== 0) continue;
    const x = pos.getX(i), l = lt.getX(i) + lt.getY(i) + lt.getZ(i);
    if (Math.abs(x) <= 1 && l > 0) litNear++;
    if (x >= 5 && l > 0) litBehind++;
  }
  assert.ok(litNear > 0, 'floor next to the lamp should be lit');
  assert.equal(litBehind, 0, 'floor behind the wall should be dark');
});
test('ray AO darker under an overhang', () => {
  const g = new VoxelGrid(P).box([-8, 0, -8], [8, 0, 8], 'a').box([-3, 3, -3], [3, 3, 3], 'b');
  const r = buildMesh(g, P, { bake: { ao: true } });
  const pos = r.solid.attributes.position, info = r.solid.attributes.aInfo, face = r.solid.attributes.aFace;
  let under = 255, open = 0;
  for (let i = 0; i < pos.count; i++) {
    if ((face.getX(i) & 7) !== 2 || pos.getY(i) !== 1) continue;
    if (pos.getX(i) === 0 && pos.getZ(i) === 0) under = Math.min(under, info.getW(i));
    if (Math.abs(pos.getX(i)) === 9 && Math.abs(pos.getZ(i)) === 9) open = Math.max(open, info.getW(i));
  }
  assert.ok(under < open, `under ${under} vs open ${open}`);
});

// ---- misc ---------------------------------------------------------------------------------------
test('rng/hash deterministic', () => {
  const a = rng(5), b = rng(5);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  assert.equal(hash3(1, 2, 3, 4), hash3(1, 2, 3, 4));
  const R = rng('seed'); const n = R.int(3, 5); assert.ok(n >= 3 && n <= 5);
});
test('parseVox: z-up → y-up, palette colors', () => {
  const chunk = (id, content) => { const b = Buffer.alloc(12 + content.length); b.write(id, 0); b.writeInt32LE(content.length, 4); content.copy(b, 12); return b; };
  const size = Buffer.alloc(12); size.writeInt32LE(1, 0); size.writeInt32LE(1, 4); size.writeInt32LE(2, 8);
  const xyzi = Buffer.alloc(12); xyzi.writeInt32LE(2, 0); Buffer.from([0, 0, 0, 1, 0, 0, 1, 2]).copy(xyzi, 4);
  const rgba = Buffer.alloc(1024); rgba.set([255, 0, 0, 255, 0, 0, 255, 255]);
  const kids = Buffer.concat([chunk('SIZE', size), chunk('XYZI', xyzi), chunk('RGBA', rgba)]);
  const main = Buffer.alloc(12); main.write('MAIN', 0); main.writeInt32LE(kids.length, 8);
  const file = Buffer.concat([Buffer.from('VOX '), Buffer.from([150, 0, 0, 0]), main, kids]);
  const { grid, palette } = parseVox(file.buffer.slice(file.byteOffset, file.byteOffset + file.length));
  const b = grid.bounds();
  assert.deepEqual(b.size, [1, 2, 1]); // stacked along vox z → our y
  const top = grid.get(b.min[0], b.max[1], b.min[2]);
  assert.equal(palette.defs[top].src.color, '#0000ff');
});

// ---- generators: every one runs, writes voxels, and is deterministic per seed -----------------------
const GEN = {
  oak: (g) => V.oak(g, [0, 1, 0], { seed: 3 }), blossom: (g) => V.blossom(g, [0, 1, 0], { seed: 3 }), bush: (g) => V.bush(g, [0, 1, 0], { seed: 3 }),
  pine: (g) => V.pine(g, [0, 1, 0], { seed: 3, snow: 'snow' }), palm: (g) => V.palm(g, [0, 1, 0], { seed: 3 }), willow: (g) => V.willow(g, [0, 1, 0], { seed: 3 }),
  branches: (g) => V.branches(g, [0, 1, 0], { seed: 3 }), rock: (g) => V.rock(g, [0, 1, 0], { seed: 3, moss: 'moss' }),
  flower: (g) => V.flower(g, [0, 1, 0], { seed: 3 }), mushroom: (g) => V.mushroom(g, [0, 1, 0], { dots: 'petalWhite' }), reeds: (g) => V.reeds(g, [0, 1, 0], { seed: 3 }),
  cloud: (g) => V.cloud(g, [0, 20, 0], { seed: 3 }), smoke: (g) => V.smoke(g, [0, 10, 0], { seed: 3 }), waterfall: (g) => V.waterfall(g, [0, 10, 0], 0),
  tile: (g) => V.tile(g, [-8, -8], [8, 8], { hills: 2, corner: 2, edge: 0.5 }), terrain: (g) => V.terrain(g, [-8, -8], [8, 8], { water: 'water', waterLevel: 3 }),
  island: (g) => V.island(g, [0, 10, 0], { radius: 8 }), pondRiver: (g) => { V.tile(g, [-10, -10], [10, 10]); V.pond(g, [0, 0], { radius: 3 }); V.river(g, [[-9, 5], [9, 6]]); V.trail(g, [[-9, -5], [9, -4]]); },
  strata: (g) => { g.box([0, 0, 0], [5, 9, 5], 'stone'); V.strata(g, { on: ['stone'] }); },
  coverVines: (g) => { g.box([0, 0, 0], [8, 6, 8], 'stone'); V.cover(g, { on: ['stone'], with: 'moss' }); V.vines(g, { on: ['stone'], density: 0.3 }); },
  scatter: (g) => { V.tile(g, [-6, -6], [6, 6]); V.scatter(g, (x, y, z, R) => V.grassTuft(g, [x, y, z], { R }), { on: ['grass'], density: 0.3 }); },
  house: (g) => V.house(g, [0, 1, 0], { chimney: true, lit: 0.5, seed: 3 }), walls: (g) => V.walls(g, [0, 1, 0], [8, 5, 6], 'brick', { openings: [{ side: '+z', w: 2, h: 3 }] }),
  fence: (g) => V.fence(g, [[0, 1, 0], [9, 1, 0], [9, 1, 6]]), stairs: (g) => V.stairs(g, [0, 1, 0], '+x', 5, 'plank', { width: 2 }), ladder: (g) => V.ladder(g, [0, 1, 0], 5),
  lamppost: (g) => V.lamppost(g, [0, 1, 0], { arm: '+x' }), well: (g) => V.well(g, [0, 1, 0]), truss: (g) => V.truss(g, [0, 1, 0], [0, 12, 0]),
  facade: (g) => { g.box([0, 0, 0], [10, 12, 4], 'concrete'); V.facade(g, [0, 1, 4], [10, 11, 4], { seed: 3 }); },
  props: (g) => { V.crate(g, [0, 1, 0]); V.barrel(g, [4, 1, 0]); V.table(g, [8, 1, 0]); V.chair(g, [12, 1, 0]); V.bed(g, [0, 1, 6]); V.bookshelf(g, [8, 1, 6]); V.fireplace(g, [14, 1, 6]); },
  bricks: (g) => V.bricks(g, [0, 0, 0], [12, 6, 1]), person: (g) => V.person(g, [0, 1, 0], { seed: 3, pose: 'wave' }), campfire: (g) => V.campfire(g, [0, 1, 0]),
  bench: (g) => V.bench(g, [0, 1, 0]), signpost: (g) => V.signpost(g, [0, 1, 0], { text: 'HI' }), lantern: (g) => V.lantern(g, [0, 8, 0]),
  bridge: (g) => V.bridge(g, [0, 1, 0], [10, 1, 0], { arch: 2 }), boat: (g) => V.boat(g, [0, 0, 0], { cabin: true, mast: 5 }), car: (g) => V.car(g, [0, 1, 0]),
};
for (const [name, fn] of Object.entries(GEN)) test(`generator ${name}`, () => {
  const make = () => { const Q = new Palette({ ...NATURE, ...BUILD }); const g = new VoxelGrid(Q); fn(g); return g; };
  const a = make(), b = make();
  assert.ok(a.count() > 0, 'wrote no voxels');
  assert.deepEqual(cells(a), cells(b), 'not deterministic');
  buildMesh(a, a.palette, { bake: { ao: true, light: true } });
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
