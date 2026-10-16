// stage.world() merging of spot/path/hop actors (lib/stage.js world extras): two regions emit the same specs with
// different spots/paths → ONE actor system per spec, each emit its own group (hoppers stay on their own stakes).
import { Stage, NATURE, BUILD } from '../lib/index.js';
const stage = new Stage({ look: 'daylight', camera: { yaw: 35, pitch: 32 } });
await stage.world({
  palette: { ...NATURE, ...BUILD }, workers: 0,
  regions: [0, 1].map((i) => ({ name: `r${i}`, module: './canopy_world/region.js', box: [[i * 40 - 40, -4, -20], [i * 40 - 1, 40, 19]] })),
});
const sys = stage.actorSystems;
console.log('canopy_world systems', sys.length, sys.map((a) => `${a.o.creature}:${a.count}${a.o.groups ? `/${a.o.groups.length}g` : ''}${a.id ? `#${a.id}` : ''}${typeof a.o.target === 'string' ? `→${a.o.target}` : ''}`).join(' '));
stage.start().then(() => console.log('canopy_world agents', JSON.stringify(sys.map((a) => a.agents.map((g) => [+g.x.toFixed(1), +g.y.toFixed(1), +g.z.toFixed(1)])))));
stage.start().then(() => console.log('canopy_world piglet→sow distances', sys.filter((a) => typeof a.o.target === 'string').map((a) => { const s = sys.find((b) => b.id === a.o.target).agents[0]; return Math.hypot(a.agents[0].x - s.x, a.agents[0].z - s.z).toFixed(1); }).join(' ')));
