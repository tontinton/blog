// Docks (east end): where the town meets the sea. Land x0..SHORE_X-1: a stone quay, warehouse, fishmonger's
// stall, crates and a crane, a fisherman's cottage and a little beach. Sea SHORE_X..x1: the road runs on as a
// pier (T end, angler, bench); behind it a harbour basin with a sailboat, a fishing boat under the crane and
// rowboats, closed by a breakwater ending in a lighthouse; in front open water, an islet, buoys, ducks, gulls.
import { tile, house, crate, lamppost, lantern, boat, rock, person, bench } from '../../../lib/index.js';
import { ROAD, Z0, Z1, SHORE_X, SEA, LIFE } from '../layout.js';

// 3×3 barrel: wooden lid on top, one dark band round the middle
const cask = (g, [x, y, z], h = 3) => g.cylinder([x, y, z], 1.5, h, (px, py, pz) => (py === y + 1 ? 'metalDark' : py === y + h - 1 && px === x && pz === z ? 'plankDark' : 'plank'));

export default function build(g, ctx) {
  const { x0, x1 } = ctx.options, R = ctx.rng, N = ctx.noise, P = ctx.P;
  const S = SHORE_X, LX = S - 1;                    // first sea column, last land column

  // ---- region-local materials ---------------------------------------------------------------------------
  P.add('docks_yard', { colors: ['#a8916c', '#9d8763', '#b29b76'], jitter: 0.05, noise: { color: '#8f7a58', scale: 0.12, amount: 0.5 } });
  P.add('docks_flag', { colors: ['#b9b2a4', '#aaa395', '#c4bdae'], jitter: 0.05, grid: 0.45 });
  P.add('docks_wetSand', { color: '#c2ab7e', jitter: 0.06, noise: { color: '#a8936a', scale: 0.2, amount: 0.5 } });
  P.add('docks_hullRed', { color: '#b4473a', jitter: 0.05 });
  P.add('docks_hullBlue', { color: '#2f5f92', jitter: 0.05 });
  P.add('docks_hullGreen', { color: '#3f7d62', jitter: 0.05 });
  P.add('docks_fish', { colors: ['#b9c6cf', '#9fb0bc'], metalness: 0.5, roughness: 0.3, jitter: 0.05 });
  P.add('docks_salmon', { color: '#e8876a', jitter: 0.05 });
  P.add('docks_ice', { color: '#e4f0f4', jitter: 0.03, roughness: 0.4 });
  P.add('docks_net', { color: '#7d8a5c', jitter: 0.08, roughness: 1 });
  P.add('docks_cork', { color: '#e0a040', jitter: 0.05 });
  P.add('docks_rope', { color: '#c9b089', jitter: 0.05 });
  P.add('docks_sail', { color: '#f3ead6', jitter: 0.03, roughness: 1, noise: { color: '#dcd0b6', scale: 0.3, amount: 0.5 } });
  P.add('docks_beacon', { color: '#fff1b8', emissive: 6, light: { color: '#ffd890', radius: 10, intensity: 1.4 } });

  // ---- ground: land tile (same depth/seed as the orchard), then paint the top ------------------------------
  tile(g, [x0, Z0], [LX, Z1], { depth: 6, seed: 3 });
  const beachX = (z) => 52 + Math.round(N.simplex2(z * 0.12, 7.3) * 2);          // grass → sand line (south)
  for (let x = x0; x <= LX; x++) for (let z = Z0; z <= Z1; z++) {
    const blend = (x - x0) + N.simplex2(x * 0.2, z * 0.2) * 3;                      // grass fringe at the market seam
    let m = null;
    if (z < ROAD.z0) m = blend > 4 ? 'docks_yard' : null;                           // packed earth yard (north)
    else if (z >= ROAD.z1 + 6 && x >= beachX(z)) m = 'sand';                          // beach (south-east)
    if (x >= 56 && z <= ROAD.z1 + 5) m = 'docks_flag';                              // the quay
    if (m) g.set(x, 0, z, g.mat(m));
  }
  // quay wall facing the sea (north of the beach), light capstones on top
  g.box([LX, -5, Z0], [LX, -1, ROAD.z1 + 5], 'stoneBrick');
  g.box([LX, 0, Z0], [LX, 0, ROAD.z1 + 5], 'stoneLight');
  // the road, all the way to the quay edge
  g.box([x0, 0, ROAD.z0], [LX, 0, ROAD.z1], ROAD.m);
  // beach columns: sand all the way down
  for (let z = ROAD.z1 + 6; z <= Z1; z++) for (let x = beachX(z); x <= LX; x++) g.box([x, -5, z], [x, -1, z], 'sand');

  // ---- sea: seabed + water, beach shelving down, a few bumps ----------------------------------------------
  g.box([S, -5, Z0], [x1, -5, Z1], SEA.bed);
  g.box([S, SEA.bottom, Z0], [x1, SEA.top, Z1], SEA.m);
  for (let x = S; x <= x1; x++) for (let z = Z0; z <= Z1; z++) {
    let top = -5;
    if (z > ROAD.z1 + 5) top = Math.max(top, Math.min(0, -1 - Math.floor((x - S + N.simplex2(x * 0.1, z * 0.15) * 2.5) / 2.6)));   // beach shelf
    if (N.simplex2(x * 0.09 + 3, z * 0.09) > 0.55) top = Math.max(top, -4);                                       // sand bars
    for (let y = -4; y <= top; y++) g.set(x, y, z, g.mat(y === top && top >= -1 ? 'docks_wetSand' : 'sand'));
  }

  // ---- breakwater + lighthouse (back right) ----------------------------------------------------------------
  const bw0 = Z0 + 1, bw1 = Z0 + 3;                                                   // z -31..-29
  g.box([S, -5, bw0], [83, 0, bw1], 'stoneBrick');
  g.box([S, 0, bw0], [83, 0, bw1], 'docks_flag');
  for (let x = S + 1; x <= 82; x += 3) {
    rock(g, [x + R.int(0, 1), -5, Z0 + R.int(0, 1)], { radius: R.range(1.8, 2.4), seed: R.int(0, 1e6), bury: 0.1 });
    if (R.chance(0.6)) rock(g, [x + 1, -5, bw1 + 1], { radius: R.range(1.3, 1.9), seed: R.int(0, 1e6), bury: 0.3 });
  }
  const LH = [88, 1, -27];
  rock(g, [LH[0], -5, LH[2]], { size: [6.5, 5, 5.5], seed: 77, bury: 0.05 });
  g.cylinder([LH[0], -5, LH[2]], 4.6, 6, 'stoneBrick');                             // round stone platform, top y = 0
  g.cylinder([LH[0], 0, LH[2]], 4.6, 1, 'docks_flag');
  const towerH = 15;
  g.cylinder(LH, 2.6, towerH, (x, y) => (Math.floor((y - 1) / 3) % 2 ? 'awningRed' : 'plaster'));
  g.box([LH[0], 1, LH[2] + 2], [LH[0], 2, LH[2] + 2], 'door');
  for (const y of [5, 9, 12]) g.set(LH[0] + 2, y, LH[2], g.mat('window'));
  const gy = LH[1] + towerH;                                                          // gallery level
  g.cylinder([LH[0], gy, LH[2]], 3.6, 1, 'metalDark');
  g.cylinder([LH[0], gy + 1, LH[2]], 3.6, 1, 'metal', { hollow: 1 });
  g.cylinder([LH[0], gy + 1, LH[2]], 1.6, 3, 'docks_beacon');
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) g.box([LH[0] + dx, gy + 1, LH[2] + dz], [LH[0] + dx, gy + 3, LH[2] + dz], 'metalDark');
  g.cone([LH[0], gy + 4, LH[2]], 2.8, 3, 'awningRed');
  g.box([LH[0], gy + 7, LH[2]], [LH[0], gy + 8, LH[2]], 'metalDark');

  // ---- main pier: the road runs on into the sea ------------------------------------------------------------
  const pz0 = ROAD.z0 + 1, pz1 = ROAD.z1 - 1, pEnd = 84;                            // deck z -2..1
  for (let x = S; x <= pEnd; x++) {
    g.box([x, 0, pz0], [x, 0, pz1], x % 2 ? 'plank' : 'plankLight');
    g.set(x, 0, pz0 - 1, g.mat('plankDark')); g.set(x, 0, pz1 + 1, g.mat('plankDark'));
    if ((x - S) % 4 === 2) for (const z of [pz0 - 1, pz1 + 1]) g.box([x, -5, z], [x, 1, z], 'beam');
  }
  // the T at the end
  g.box([pEnd + 1, 0, pz0 - 4], [pEnd + 5, 0, pz1 + 4], (x, y, z) => ((x + z) % 2 ? 'plank' : 'plankLight'));
  for (const [x, z] of [[pEnd + 1, pz0 - 4], [pEnd + 5, pz0 - 4], [pEnd + 1, pz1 + 4], [pEnd + 5, pz1 + 4], [pEnd + 5, 0]]) g.box([x, -5, z], [x, 1, z], 'beam');
  lamppost(g, [S + 10, 1, pz1 + 1], { height: 7 });
  lamppost(g, [pEnd + 3, 1, pz0 - 4], { height: 7 });
  bench(g, [pEnd + 2, 1, pz1 + 3], '-z', { length: 3 });
  person(g, [pEnd + 5, 1, pz1 + 2], { side: '+x', pose: 'sit', seed: 41, hat: 'docks_hullBlue' });
  g.line([pEnd + 7, 4, pz1 + 3], [pEnd + 10, 7, pz1 + 3], 'beam');                    // fishing rod
  g.box([pEnd + 10, 0, pz1 + 3], [pEnd + 10, 6, pz1 + 3], 'docks_rope');

  // ---- harbour basin (between the breakwater and the pier, behind it from the camera) -----------------------
  // sailboat moored along the pier's north side
  const sbx = S + 8, sbz = pz0 - 6, sbL = 11;                                        // hull x 72..82, z -10..-6
  boat(g, [sbx, -2, sbz], { length: sbL, width: 5, height: 4, hull: 'docks_hullBlue', hullTop: 'plaster', deck: 'plankLight' });
  const mx = sbx + 6, mTop = 14;
  g.box([mx, 1, sbz], [mx, mTop, sbz], 'beam');
  g.box([sbx + 1, 2, sbz], [mx - 1, 2, sbz], 'beam');                                 // boom
  for (let y = 3; y <= mTop - 1; y++) { const w = Math.round((mTop - y) * 0.55); if (w > 0) g.box([mx - w, y, sbz], [mx - 1, y, sbz], 'docks_sail'); }
  for (let y = 3; y <= mTop - 3; y++) { const w = Math.round((mTop - 2 - y) * 0.35); if (w > 0) g.box([mx + 1, y, sbz], [mx + w, y, sbz], 'docks_sail'); }   // jib
  g.set(mx, mTop + 1, sbz, g.mat('awningRed')); g.set(mx + 1, mTop + 1, sbz, g.mat('awningRed'));
  g.line([sbx + 1, 1, sbz + 2], [sbx - 1, 1, pz0 - 1], 'docks_rope');                // mooring lines to the pier edge
  g.line([sbx + sbL - 2, 1, sbz + 1], [sbx + sbL, 1, pz0 - 1], 'docks_rope');

  // fishing boat further in, with the quay crane loading it
  const bz = -18, bx = S + 2;                                                         // hull x 66..79, z -20..-16
  boat(g, [bx, -2, bz], { length: 14, width: 5, height: 4, hull: 'docks_hullRed', hullTop: 'awningCream', deck: 'plankLight',
    cabin: { at: 1, w: 4, h: 3, m: 'plaster', roof: 'plankDark' } });
  g.box([bx + 10, 1, bz], [bx + 10, 10, bz], 'beam');                                 // mast
  g.box([bx + 10, 7, bz - 1], [bx + 10, 7, bz + 1], 'beam');                          // cross-tree
  g.set(bx + 11, 10, bz, g.mat('awningRed')); g.set(bx + 12, 10, bz, g.mat('awningRed'));
  g.line([LX - 1, 1, -20], [bx, 1, bz - 1], 'docks_rope');                            // mooring line to a bollard
  const cx = LX - 3, cz = bz;                                                         // crane post x 60..61
  g.box([cx, 1, cz], [cx + 1, 12, cz + 1], 'beam');
  g.box([cx - 2, 13, cz], [bx + 8, 13, cz], 'plankDark');                             // jib arm out over the boat
  g.line([cx + 1, 9, cz], [cx + 5, 12, cz], 'beam');                                  // brace
  g.box([cx - 3, 11, cz], [cx - 2, 12, cz + 1], 'stoneDark');                         // counterweight
  g.box([bx + 7, 6, cz], [bx + 7, 12, cz], 'docks_rope');
  crate(g, [bx + 6, 4, cz - 1]); crate(g, [bx + 6, 4, cz + 1], { size: 1 });          // the load

  // rowboats: a seat across the middle so they read as boats, not rings
  const rowboat = (x, z, hull) => {
    boat(g, [x, -1, z], { length: 6, width: 3, height: 3, hull, hullTop: 'awningCream', deck: 'plankLight' });
    g.set(x + 3, 1, z, g.mat('plank'));
  };
  rowboat(S + 19, -16, 'docks_hullGreen');
  rowboat(S + 21, -23, 'docks_hullRed');
  rowboat(S + 3, pz1 + 4, 'docks_hullBlue');                                          // tied to the pier, south side
  g.line([S + 4, 1, pz1 + 3], [S + 5, 1, pz1 + 1], 'docks_rope');

  // ---- warehouse at the back ---------------------------------------------------------------------------
  const wx = x0 + 3, wz = Z0 + 2;
  house(g, [wx, 1, wz], { w: 19, d: 10, h: 7, wall: 'brick', roof: 'roofSlate', overhang: 1, door: { side: '+z', w: 4, h: 5 },
    windows: 3, lit: 0.5, posts: 'beam', beam: 'beam', seed: R.int(0, 1e6) });
  lantern(g, [wx + 9, 7, wz + 10], { drop: 1 });
  // hoist beam over the loft door
  g.box([wx + 9, 8, wz + 9], [wx + 10, 9, wz + 9], 'door');
  g.box([wx + 9, 10, wz + 10], [wx + 9, 10, wz + 12], 'beam');

  // ---- fishmonger's stall (faces the road) -----------------------------------------------------------------
  const sx0 = x0 + 4, sx1 = x0 + 13, sz0 = ROAD.z0 - 9, sz1 = ROAD.z0 - 3;          // x 36..45, z -12..-6
  g.box([sx0, 1, sz0], [sx1, 7, sz0], 'plank');                                       // back wall
  for (const x of [sx0, sx1]) { g.box([x, 1, sz0], [x, 7, sz1], 'plank'); g.box([x, 1, sz1], [x, 7, sz1], 'beam'); }
  g.box([sx0, 1, sz0 + 1], [sx1, 1, sz0 + 1], 'plankDark');
  for (let x = sx0 - 1; x <= sx1 + 1; x++) {
    const stripe = (x - sx0) % 2 === 0 ? 'awningBlue' : 'awningCream';
    g.box([x, 8, sz0 - 1], [x, 8, sz1], 'plankDark');
    g.set(x, 8, sz1 + 1, g.mat(stripe)); g.set(x, 7, sz1 + 2, g.mat(stripe));
  }
  // counter with ice and fish
  g.box([sx0 + 1, 1, sz1 - 1], [sx1 - 1, 2, sz1 - 1], 'plank');
  g.box([sx0 + 1, 3, sz1 - 1], [sx1 - 1, 3, sz1 - 1], 'docks_ice');
  for (let x = sx0 + 1; x <= sx1 - 1; x++) if (R.chance(0.7)) g.set(x, 4, sz1 - 1, g.mat(R.chance(0.3) ? 'docks_salmon' : 'docks_fish'));
  person(g, [sx0 + 4, 1, sz1 - 3], { side: '+z', seed: 12, shirt: 'plaster', hat: 'awningBlue' });
  lantern(g, [sx0 + 1, 7, sz1 + 1], { drop: 1 }); lantern(g, [sx1 - 1, 7, sz1 + 1], { drop: 1 });
  cask(g, [sx1 + 2, 1, sz1 - 1]);

  // ---- crates & barrels around the yard -------------------------------------------------------------------
  for (const [x, z, r] of [[50, -14, 0], [54, -18, 90], [48, -9, 180]]) ctx.instance('crates', [x, 1, z], r, 1);
  crate(g, [57, 1, -20], { size: 3 }); crate(g, [57, 4, -20], { size: 2 }); crate(g, [60, 1, -21]);
  for (const [x, z] of [[57, -9], [57, -6], [56, -25]]) cask(g, [x, 1, z]);
  crate(g, [57, 1, 4]); crate(g, [57, 3, 4]); crate(g, [59, 1, 5]); cask(g, [61, 1, 6]);

  // ---- bollards along the quay edge -------------------------------------------------------------------------
  for (let z = Z0 + 6; z <= ROAD.z1 + 4; z += 6) if (z < ROAD.z0 - 1 || z > ROAD.z1 + 1) g.box([LX - 1, 1, z], [LX - 1, 1, z], 'metalDark');

  // ---- lampposts along the road ---------------------------------------------------------------------------
  for (const [x, z] of [[x0 + 18, ROAD.z0 - 1], [x0 + 8, ROAD.z1 + 1], [LX - 1, ROAD.z1 + 1]]) lamppost(g, [x, 1, z], { height: 7 });

  // ---- fisherman's cottage (south) + garden, nets, beached rowboat ----------------------------------------
  const hx = x0 + 3, hz = ROAD.z1 + 10;
  const { chimneyTop } = house(g, [hx, 1, hz], { w: 11, d: 8, h: 5, wall: 'plaster', roof: 'roofTile', door: { side: '+x' }, chimney: true, lit: 0.7, seed: R.int(0, 1e6) });
  ctx.emit('particles', { preset: 'smoke', box: [[chimneyTop[0] - 1, chimneyTop[1], chimneyTop[2] - 1], [chimneyTop[0] + 1, chimneyTop[1] + 14, chimneyTop[2] + 1]] });
  ctx.instance('oak', [hx + 3, 1, Z1 - 6], 30, 0.85);
  ctx.instance('pine', [x0 + 5, 1, hz - 5], 0, 0.8);
  // net drying rack on the beach, facing the camera (+z)
  const nx = 49, nz = Z1 - 4;
  for (const x of [nx, nx + 7]) g.box([x, 1, nz], [x, 5, nz], 'beam');
  g.box([nx, 6, nz], [nx + 7, 6, nz], 'beam');
  for (let x = nx + 1; x < nx + 7; x++) for (let y = 2; y <= 5; y++) if ((x + y) % 2 === 0 || y === 5) g.set(x, y, nz, g.mat('docks_net'));
  for (const x of [nx + 2, nx + 5]) g.set(x, 2, nz + 1, g.mat('docks_cork'));
  // beached rowboat on the sand + lobster pots
  boat(g, [56, 1, 21], { length: 7, width: 3, height: 3, hull: 'docks_hullGreen', hullTop: 'awningCream', deck: 'plankLight' });
  for (const [x, z] of [[54, 12], [55, 14]]) crate(g, [x, 1, z], { m: 'docks_net', edge: 'plankDark' });

  // ---- rocks and buoys in the water ------------------------------------------------------------------------
  rock(g, [86, -5, 22], { size: [5, 4.6, 4], seed: 913, bury: 0.05 });               // a little islet
  for (let x = 81; x <= 91; x++) for (let z = 18; z <= 26; z++) {                       // grassy top
    const y = g.top(x, z, 12);
    if (y >= 1 && Math.hypot((x - 86) / 4, (z - 22) / 3.2) < 1) g.set(x, y, z, g.mat(R.chance(0.3) ? 'grassLight' : 'grass'));
  }
  for (const [x, z, r] of [[92, 12, 2.6], [77, 28, 1.6], [94, -14, 2.2], [80, 25, 1.4]]) rock(g, [x, -5, z], { radius: r, seed: R.int(0, 1e6), bury: 0.05, moss: 'moss' });
  for (const [x, z] of [[91, -8], [88, 7], [76, 14], [84, 19]]) { g.set(x, -1, z, g.mat('awningRed')); g.set(x, 0, z, g.mat('awningCream')); g.set(x, 1, z, g.mat('awningRed')); }

  // ---- life ------------------------------------------------------------------------------------------------
  ctx.emit('actors', { ...LIFE.walker, count: 3, area: [[x0, ROAD.z0], [pEnd + 5, ROAD.z1]] });
  ctx.emit('actors', { ...LIFE.walker, count: 2, area: [[56, Z0 + 4], [LX, ROAD.z1 + 5]] });
  // same keys (and key order) as the market's cats/walkers → merged into their actor systems: no extra draw calls
  ctx.emit('actors', { ...LIFE.cat, count: 1, area: [[sx0 - 2, sz1 + 1], [sx1 + 4, ROAD.z1]] });
  ctx.emit('actors', { creature: 'duck', count: 3, on: 'water', area: [[S + 6, ROAD.z1 + 8], [x1 - 4, Z1 - 3]] });
  ctx.emit('actors', { ...LIFE.gulls, count: 5, center: [S + 16, 26, -12], radius: 13 });   // gulls

  // rocks at the tile edge are cut flat like the rest of the diorama (instead of spilling into the void)
  const [[bx0, by0, bz0], [bx1, by1, bz1]] = ctx.box;
  g.paint((x, y, z) => (x < bx0 || y < by0 || z < bz0 || x > bx1 || y > by1 || z > bz1 ? 0 : undefined));
}
