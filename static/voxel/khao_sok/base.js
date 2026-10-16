// The shared ground of the whole world — every region calls ground(g, ctx) FIRST, so the slab, the lake and the
// river line up across region seams by construction. Draws, for each column of ctx.box:
//   land  : solid slab from BOTTOM up to groundY(x, z); top = forest floor / river bank / reservoir shore band;
//           strata (soil, red laterite, clay, bedrock) show on the slab's outer walls
//   river : bed (pebbles) + water up to the stepped river surface (riverY)
//   lake  : rock + silt/sand bed + water up to LAKE_Y; within 20 of an outer wall the water below the surface is
//           clear (lakeClear, glass) so the cutaway shows the lake bed instead of milky teal
// Returns nothing; query levels with layout.js (columnAt, groundY, surfaceY, riverAt, isLake …).
import { noise, hash3 } from '../lib/index.js';
import { BOTTOM, LAKE_Y, X0, X1, Z0, Z1, columnAt, landDist, riverAt } from './layout.js';

const CLEAR = 20;   // lake columns this close to an outer wall get clear water below the surface (the glass cutaway)

const N = noise(808);

// strata by absolute height (wobbly bands), used below the top few voxels
function stratum(x, y, z) {
  const w = N.simplex2(x * 0.05 + z * 0.05, y * 0.02) * 1.6;
  const yy = y + w;
  if (yy > -3) return hash3(x, y, z, 5) < 0.25 ? 'soilDark' : 'soil';
  if (yy > -6) return 'laterite';
  if (yy > -8) return 'clayBand';
  if (yy > -11) return hash3(x, y, z, 6) < 0.3 ? 'bedrockDark' : 'bedrock';
  return 'bedrockDark';
}

export function ground(g, ctx) {
  const [[x0, , z0], [x1, , z1]] = ctx.box;
  const m = (n) => g.mat(n);
  const M = {
    floor: m('floor'), floorLitter: m('floorLitter'), floorMoss: m('floorMoss'), bank: m('bank'), shore: m('shore'),
    shoreRock: m('shoreRock'), soil: m('soil'), soilDark: m('soilDark'), laterite: m('laterite'), clayBand: m('clayBand'),
    bedrock: m('bedrock'), bedrockDark: m('bedrockDark'), silt: m('silt'), sandJ: m('sandJ'), riverBed: m('riverBed'),
    lakeWater: m('lakeWater'), riverWater: m('riverWater'), lakeClear: m('lakeClear'),
  };
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const c = columnAt(x, z);
    if (c.kind === 'land') {
      const top = c.top;
      const ld = landDist(x, z), r = riverAt(x, z);
      let tm;
      if (r.d < r.w + 2.2 + N.simplex2(x * 0.2, z * 0.2) * 0.8) tm = 'bank';
      else if (ld < 3.5 + N.simplex2(x * 0.15, z * 0.15) * 1.5) tm = top <= 1 ? 'shore' : 'shoreRock';
      else {
        const n = N.fbm2(x * 0.045, z * 0.045, { octaves: 3 });
        tm = n > 0.32 ? 'floorMoss' : n < -0.3 ? 'floorLitter' : 'floor';
      }
      for (let y = BOTTOM; y <= top; y++) {
        const d = top - y;
        const id = d === 0 ? tm : d <= 2 ? (tm === 'shore' || tm === 'shoreRock' ? 'laterite' : 'soil') : stratum(x, y, z);
        g.set(x, y, z, M[id]);
      }
    } else {
      const { water, bed } = c;
      const bedTop = c.kind === 'lake' ? (bed >= water - 3 ? 'sandJ' : 'silt') : 'riverBed';   // pale sand shallows read jade through the water
      for (let y = BOTTOM; y <= bed; y++) g.set(x, y, z, M[y === bed ? bedTop : bed - y <= 2 ? (c.kind === 'lake' ? 'silt' : 'soil') : stratum(x, y, z)]);
      const wm = c.kind === 'lake' ? M.lakeWater : M.riverWater;
      const clear = c.kind === 'lake' && Math.min(x - X0, X1 - x, z - Z0, Z1 - z) < CLEAR;
      for (let y = bed + 1; y <= water; y++) g.set(x, y, z, clear && y < water ? M.lakeClear : wm);
    }
  }
}

export { LAKE_Y };
