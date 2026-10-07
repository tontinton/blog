// Family Autumn — our little family (two humans, an Alaskan malamute and two British shorthairs) on a
// lazy autumn afternoon in a log cabin in the woods: fire crackling, leaves falling outside.
//
// The scene is assembled from modules that share layout.js:
//   room.js    cabin, fireplace, furniture, the autumn forest outside (+ fire light, smoke, leaves)
//   people.js  the two of us on the sofa        dog.js   the malamute on the rug
//   cats.js    the round cat on her pouf and the smaller one on the window seat
// Each module exports MATERIALS (palette defs, prefixed names) and build(g, P, ctx) → { parts, update,
// particles, actors, lights }. Static voxels go into the shared grid g; moving bits (heads, tails, arms)
// are returned as parts — grids in the same world coordinates + a pivot — that update(t, parts) rotates.
// Parts are baked with the room as bake context, so they get the same fire glow and AO.
//
// Dev: ?solo=dog (one module on stand-in furniture, camera on it; add &room=1 for the real room),
//      ?skip=cats (leave a module out), ?parts=0 (no animation).
import { Stage, VoxelGrid, Palette, NATURE, BUILD, sharedBaker } from '../lib/index.js';
import * as L from './layout.js';

const q = new URLSearchParams(location.search);
const solo = q.get('solo');
const skip = new Set((q.get('skip') ?? '').split(',').filter(Boolean));
const CHARS = ['people', 'dog', 'cats'];
const want = (solo ? (solo === 'room' ? [] : [{ husband: 'people', wife: 'people', fatcat: 'cats', kitten: 'cats' }[solo] ?? solo]) : CHARS).filter((n) => !skip.has(n));
const useRoom = !skip.has('room') && (!solo || solo === 'room' || q.get('room') === '1');
const names = [useRoom ? 'room' : 'stub', ...want];

const mods = {};
for (const n of names) mods[n] = await import(`./${n}.js`);

const stage = new Stage({
  look: ['cozy', {
    background: { type: 'linear', colors: ['#2b2f52', '#6a4f72', '#e0a07a'], mid: 0.6 },
    exposure: 1.3,
    fill: { color: '#a8b8ff', intensity: 0.45, azimuth: 80, elevation: 30 },
    sky: { top: '#8a9ad0', horizon: '#c89a8a', bottom: '#2a1a14', intensity: 0.9 },
    voxel: { bakedLight: 1.7, jitter: 0.5 },                                // calmer per-voxel noise
    sun: { color: '#ffc890', intensity: 1.4, azimuth: 30, elevation: 38, softness: 2.5, mapSize: 2048, update: 2 },
    ground: { reflect: 0, opacity: 0.45, color: '#241a30' },
    vignette: { amount: 0.3 },
  }],
  camera: {
    yaw: L.CAMERA.yaw, pitch: L.CAMERA.pitch,
    ...(solo ? { target: L.FOCUS[solo] ?? L.CAMERA.target, zoom: 2.4 } : { target: L.CAMERA.target, zoom: L.CAMERA.zoom }),
  },
  ui: { title: 'Family Autumn', subtitle: 'A lazy autumn afternoon in the cabin' },
  pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),   // retina at 1.5× (+ MSAA) looks the same, ~45% fewer pixels
});

const P = new Palette(Object.assign({ ...NATURE, ...BUILD }, ...names.map((n) => mods[n].MATERIALS ?? {})));
const g = new VoxelGrid(P);
await stage.progress('Building the cabin', 0.15);

const built = {};
for (const n of names) {
  built[n] = mods[n].build(g, P, { L, solo, stage }) ?? {};
  await stage.progress(`Building ${n}`, 0.15 + 0.5 * (names.indexOf(n) + 1) / names.length);
}

const animate = q.get('parts') !== '0';
const allParts = Object.values(built).flatMap((b) => b.parts ?? []);
await stage.progress('Lighting', 0.7);
// one AO volume + light field for the room and every moving part (parts get the fire glow of the room)
const baker = sharedBaker([g, ...allParts.map((p) => p.grid)], P, { ao: { radius: 8 }, light: true });
const bake = { baker };
stage.add(g, { bake });

const groups = {};
for (const [n, b] of Object.entries(built)) {
  groups[n] = {};
  for (const p of b.parts ?? []) {
    const grp = stage.add(p.grid, { pivot: p.pivot, position: p.pivot, fit: false, contact: false, bake, name: `${n}.${p.name}` });
    grp.userData.rest = [...p.pivot];
    groups[n][p.name] = grp;
  }
}
await stage.progress('Lighting', 0.9);

for (const b of Object.values(built)) {
  for (const o of b.particles ?? []) stage.particles(o);
  for (const o of b.lights ?? []) b.lightObjects = [...(b.lightObjects ?? []), stage.light(o)];
  for (const o of b.actors ?? []) stage.actors(o);
}
if (animate) stage.onUpdate((t, dt) => {
  for (const [n, b] of Object.entries(built)) b.update?.(t, groups[n], P, b, dt);
});
stage.start();
