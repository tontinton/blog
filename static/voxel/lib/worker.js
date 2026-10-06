// Module worker: builds regions/assets and meshes clusters off the main thread (see pool.js, world.js).
import { VoxelGrid } from './grid.js';
import { Palette } from './palette.js';
import { buildMesh, arrayBuffers } from './mesher.js';
import { runRegion, runAssets } from './world.js';

const chunkBuffers = (chunks) => chunks.map((c) => c.data.buffer);

self.onmessage = async ({ data: msg }) => {
  const { id, type } = msg;
  try {
    if (type === 'region') {
      const res = await runRegion(msg.region, msg.palette);
      self.postMessage({ id, res }, chunkBuffers(res.chunks));
    } else if (type === 'assets') {
      const res = await runAssets(msg.url, msg.names, msg.palette);
      self.postMessage({ id, res }, Object.values(res).flatMap((a) => chunkBuffers(a.chunks)));
    } else if (type === 'mesh') {
      const P = Palette.deserialize(msg.palette);
      const g = new VoxelGrid(P);
      for (const c of msg.chunks) g.adopt(c);
      const emit = msg.emit.map((k) => g.chunks.get(k)).filter(Boolean);
      const res = buildMesh(g, P, { ...msg.opts, chunks: emit, bounds: msg.bounds, arrays: true });
      self.postMessage({ id, res }, [...arrayBuffers(res.solid), ...arrayBuffers(res.transparent)]);
    } else throw new Error(`unknown job ${type}`);
  } catch (e) {
    self.postMessage({ id, error: e?.stack || String(e) });
  }
};
