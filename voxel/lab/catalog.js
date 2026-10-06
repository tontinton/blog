// Registry catalog: every registered generator / creature / shading, one labelled cell each.
//   ?scene=catalog                        all generators       &category=nature|terrain|build|<yours>
//   ?scene=catalog&kind=creature          all creatures (animated)
//   ?scene=catalog&kind=shading           a small diorama per shading
//   &only=oak,pine  &cell=26  &cols=6
// New things you register (defineGenerator / defineCreature / defineShading with an example) show up here.
import * as V from '../lib/index.js';
const { Stage, VoxelGrid, Palette, NATURE, BUILD, THREE } = V;
const q = new URLSearchParams(location.search);
const kind = q.get('kind') ?? 'generator', category = q.get('category'), only = q.get('only')?.split(',');
const entries = V.list(kind).filter((e) => (!category || e.category === category) && (!only || only.includes(e.name)) && (kind === 'shading' || e.example));
if (!entries.length) throw new Error(`catalog: nothing registered for kind=${kind}${category ? ` category=${category}` : ''}`);
const cell = Number(q.get('cell') ?? 26), cols = Number(q.get('cols') ?? Math.ceil(Math.sqrt(entries.length * 1.4))), h = Math.floor(cell / 2) - 2;
const stage = new Stage({ look: q.get('look') ?? 'daylight', camera: { yaw: 35, pitch: 38 } });
const P = new Palette({ ...NATURE, ...BUILD, water: { color: '#4ab4c8', kind: 'water', opacity: 0.4 } });
const at = (i) => [(i % cols - (cols - 1) / 2) * cell, Math.floor(i / cols) * cell - ((Math.ceil(entries.length / cols) - 1) / 2) * cell];
const pad = (g, water) => { V.tile(g, [-h, -h], [h, h], { depth: 2, corner: 2, seed: 1 }); if (water) V.pond(g, [0, 0], { radius: h - 3, depth: 2, shore: false }); };

const g = new VoxelGrid(P);
const labels = [];
entries.forEach((e, i) => {
  const [cx, cz] = at(i);
  labels.push({ text: e.name, p: new THREE.Vector3(cx + h + 1, 0, cz + h + 1) }); // near corner of the pad
  if (kind === 'generator') {
    const sub = new VoxelGrid(P);
    if (e.ground !== false) pad(sub);
    e.example(sub);
    g.stamp(sub, cx, 0, cz);
  } else if (kind === 'creature') {
    const sub = new VoxelGrid(P);
    pad(sub, e.habitat === 'water');
    if (e.habitat === 'air') for (let k = 0; k < 5; k++) V.flower(sub, [-6 + k * 3, 1, (k % 2) * 4 - 2], { seed: k });
    g.stamp(sub, cx, 0, cz);
  } else if (kind === 'shading') {
    const sub = new VoxelGrid(P);
    pad(sub);
    V.house(sub, [-5, 1, -4], { w: 8, d: 6, h: 4, seed: 2 }); V.oak(sub, [6, 1, 5], { height: 9, seed: 2 });
    stage.add(sub, { position: [cx, 0, cz], shading: e.name, bake: { ao: true } });
  }
});
if (g.count()) stage.add(g, { bake: { ao: true, light: true } });
if (kind === 'creature') entries.forEach((e, i) => {
  const [cx, cz] = at(i);
  e.example(stage, { area: [[cx - h + 2, cz - h + 2], [cx + h - 2, cz + h - 2]], center: [cx, 1, cz] });
});

// HTML labels projected under each cell
const box = document.createElement('div');
box.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:600 12px/1 ui-monospace,monospace;color:#fff;text-shadow:0 1px 2px #000a';
document.body.appendChild(box);
for (const l of labels) { l.el = document.createElement('div'); l.el.textContent = l.text; l.el.style.cssText = 'position:absolute;transform:translate(-50%,3px);white-space:nowrap'; box.appendChild(l.el); }
const v = new THREE.Vector3();
stage.onUpdate(() => {
  const c = stage.renderer.domElement, w = c.clientWidth, hh = c.clientHeight;
  for (const l of labels) { v.copy(l.p).project(stage.camera); l.el.style.left = `${((v.x + 1) / 2) * w}px`; l.el.style.top = `${((1 - v.y) / 2) * hh}px`; }
});
stage.start();
