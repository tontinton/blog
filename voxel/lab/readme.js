import { Stage, VoxelGrid, Palette, NATURE, BUILD, tile, house, pine, smoke } from '../lib/index.js';

const stage = new Stage({ look: 'golden', camera: { yaw: 40, pitch: 30 }, ui: { title: 'Hut' } });
const P = new Palette({ ...NATURE, ...BUILD, lamp: { color: '#ffd28a', emissive: 5, light: { radius: 8 } } });
const g = new VoxelGrid(P);

tile(g, [-12, -12], [12, 12], { depth: 5 });                 // grass/dirt/stone slab, top at y = 0
const { chimneyTop } = house(g, [-6, 1, -5], { w: 10, d: 8, chimney: true, lit: 0.8 });
smoke(g, chimneyTop);
pine(g, [7, 1, 6], { height: 14 });
g.set(0, 1, 6, P.lamp);                                       // a single glowing voxel that lights its surroundings

stage.add(g, { bake: { ao: true, light: true } });            // mesh + bake AO and emissive light
stage.particles({ preset: 'fireflies' });
stage.start();
