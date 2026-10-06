// MagicaVoxel .vox import → VoxelGrid + Palette (Z-up is converted to this lib's Y-up).
//
//   const { grid, palette, ids } = await loadVox('./ship.vox', {
//     materials: { 12: { emissive: 4, light: true }, 33: { kind: 'water' } },   // per palette index overrides
//   });
//   stage.add(grid);
//   // or merge into your own scene: g.stamp(grid, 10, 1, 4) (palettes merge by material name: 'vox12', ...)
//
// Supports multiple models + scene-graph translations (nTRN/nGRP/nSHP); rotations are ignored.
import { Palette } from './palette.js';
import { VoxelGrid } from './grid.js';
import { hex } from './color.js';

export async function loadVox(url, opts = {}) {
  const buf = await (await fetch(url)).arrayBuffer();
  return parseVox(buf, opts);
}

export function parseVox(buf, opts = {}) {
  const dv = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  if (str(0, 4) !== 'VOX ') throw new Error('not a .vox file');
  const models = [], nodes = new Map();
  let rgba = null, size = null;
  const readDict = (o) => {
    const n = dv.getInt32(o, true); o += 4;
    const d = {};
    for (let i = 0; i < n; i++) {
      const kl = dv.getInt32(o, true); const k = str(o + 4, kl); o += 4 + kl;
      const vl = dv.getInt32(o, true); const v = str(o + 4, vl); o += 4 + vl;
      d[k] = v;
    }
    return [d, o];
  };
  const walk = (o, end) => {
    while (o < end) {
      const id = str(o, 4), content = dv.getInt32(o + 4, true), children = dv.getInt32(o + 8, true);
      const c = o + 12;
      if (id === 'SIZE') size = [dv.getInt32(c, true), dv.getInt32(c + 4, true), dv.getInt32(c + 8, true)];
      else if (id === 'XYZI') {
        const n = dv.getInt32(c, true);
        models.push({ size, data: new Uint8Array(buf, c + 4, n * 4) });
      } else if (id === 'RGBA') rgba = new Uint8Array(buf, c, 1024);
      else if (id === 'nTRN') {
        const nid = dv.getInt32(c, true);
        let [, p] = readDict(c + 4);
        const child = dv.getInt32(p, true); p += 4 + 8; // child, reserved, layer
        const frames = dv.getInt32(p, true); p += 4;
        let t = [0, 0, 0];
        if (frames > 0) { const [f] = readDict(p); if (f._t) t = f._t.split(' ').map(Number); }
        nodes.set(nid, { type: 'T', child, t });
      } else if (id === 'nGRP') {
        const nid = dv.getInt32(c, true);
        let [, p] = readDict(c + 4);
        const n = dv.getInt32(p, true);
        const kids = [];
        for (let i = 0; i < n; i++) kids.push(dv.getInt32(p + 4 + i * 4, true));
        nodes.set(nid, { type: 'G', kids });
      } else if (id === 'nSHP') {
        const nid = dv.getInt32(c, true);
        let [, p] = readDict(c + 4);
        nodes.set(nid, { type: 'S', model: dv.getInt32(p + 4, true) });
      }
      if (children) walk(c + content, c + content + children);
      o = c + content + children;
    }
  };
  walk(8, buf.byteLength);

  const palette = opts.palette ?? new Palette();
  const grid = new VoxelGrid(palette);
  const ids = new Map();
  const idFor = (ci) => {
    let id = ids.get(ci);
    if (id === undefined) {
      const r = rgba ? rgba[(ci - 1) * 4] : ci, gg = rgba ? rgba[(ci - 1) * 4 + 1] : ci, b = rgba ? rgba[(ci - 1) * 4 + 2] : ci;
      const name = `${opts.prefix ?? 'vox'}${ci}`;
      id = palette.has(name) ? palette.id(name) : palette.add(name, { color: hex([r / 255, gg / 255, b / 255]), jitter: 0.02, ...(opts.base ?? {}), ...(opts.materials?.[ci] ?? {}) });
      ids.set(ci, id);
    }
    return id;
  };
  const place = (m, t) => {
    // MagicaVoxel translations are model centers
    const off = [t[0] - Math.floor(m.size[0] / 2), t[1] - Math.floor(m.size[1] / 2), t[2] - Math.floor(m.size[2] / 2)];
    const d = m.data;
    for (let i = 0; i < d.length; i += 4) {
      const x = d[i] + off[0], y = d[i + 1] + off[1], z = d[i + 2] + off[2];
      grid.set(x, z, -y, idFor(d[i + 3])); // Z-up → Y-up
    }
  };
  if (nodes.size && nodes.has(0)) {
    const visit = (nid, t) => {
      const n = nodes.get(nid);
      if (!n) return;
      if (n.type === 'T') visit(n.child, [t[0] + n.t[0], t[1] + n.t[1], t[2] + n.t[2]]);
      else if (n.type === 'G') n.kids.forEach((k) => visit(k, t));
      else if (n.type === 'S' && models[n.model]) place(models[n.model], t);
    };
    visit(0, [0, 0, 0]);
  } else models.forEach((m) => place(m, [Math.floor(m.size[0] / 2), Math.floor(m.size[1] / 2), Math.floor(m.size[2] / 2)]));
  if (opts.recenter !== false) grid.recenter();
  return { grid, palette, ids };
}
