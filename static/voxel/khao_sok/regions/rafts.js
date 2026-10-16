// rafts (ME: x 40…119, z −40…39) — the Cheow Lan floating raft-house village. All lake (bed −2…−11).
//
// A curved bamboo boardwalk (the "spine") sweeps in a crescent around a sheltered lagoon that opens toward the camera:
// four raft bungalows along the north (porches facing +z) and two along the west (+x), with the floating restaurant
// — the village hub — in the middle of the west side, where the shore walkway lands (west edge, z ≈ −5). Everything
// fronts onto the spine, lit by a rhythm of lantern posts; a red-and-white buoy line closes the swimming lagoon and a
// red-roofed floating sala ends the crescent in the north-east. Palette: wood + thatch + ONE warm red-orange accent family
// (sala, lanterns, robes, the flag, the buoys); clothes are muted. Stories: a noodle boat steaming at the restaurant, a
// monk's morning alms, a sepak takraw game on the deck in front of h3 (one player mid bicycle-kick, the rattan ball in the
// air, a second ball bobbing in the lagoon with a kid swimming for it), a kid leaping off the swim raft, a fisherman, a
// hammock nap, lotus shallows, a little tuxedo cat on a tin roof watching the game, fish cages with kingfishers and a
// water monitor eyeing a leaping barb.
import { ground } from '../base.js';
import { LIFE } from '../layout.js';
import { raftHouse, walkway, longtail, kayak, person, lilyPads, sala, spline, cover } from '../../lib/index.js';
import {
  WY, DY, frame, houseGeo, materials, kid, swimmer, splash, potPlant, lanternPost, rowboat, fishCage, swimRaft, restaurant, hat, isWater,
  takrawBall, player, cannonball, foamRing, thatchHouseRoof,
} from './rafts-parts.js';

export default function build(g, ctx) {
  ground(g, ctx);
  materials(ctx.P);
  ctx.clip = true;                       // the landing walkway's rounded end pokes past x = 40 on purpose
  const R = ctx.rng;


  // ---- raft houses: north row (porches +z), west row (+x); all porch ladders land on the spine
  const H = [
    { id: 'h1', p: [51, -31], side: '+z', seed: 11, roof: 'thatch', hammock: false },
    { id: 'h2', p: [66, -30], side: '+z', seed: 12, roof: 'tin', hammock: false },
    { id: 'h3', p: [80, -29], side: '+z', seed: 13, roof: 'thatch', laundry: false, hammock: false },
    { id: 'h4', p: [94, -27], side: '+z', seed: 14, roof: 'thatch', hammockM: 'hammock' },
    { id: 'h5', p: [53, 16], side: '+x', seed: 15, roof: 'thatch', hammock: false, laundry: false },
    { id: 'h6', p: [53, 30], side: '+x', seed: 16, roof: 'thatch', hammock: false },
  ];
  const houses = {};
  for (const h of H) {
    const o = { side: h.side, w: h.w ?? 7, d: h.d ?? 6, porch: h.porch ?? 6, roof: h.roof, hammock: h.hammock, hammockM: h.hammockM, laundry: h.laundry, seed: h.seed };
    const r = raftHouse(g, [h.p[0], WY, h.p[1]], o);
    houses[h.id] = { ...h, r, geo: houseGeo(o), F: frame(g, [h.p[0], WY, h.p[1]], h.side) };
  }
  // calm the lib's porch confetti (laundry, sandals, hammock stripes, flower pots) down to the muted village palette
  {
    const MUTE = { ribbonGreen: 'rafts_khaki', awningBlue: 'rafts_indigo', awningYellow: 'rafts_cream', ribbonYellow: 'rafts_cream', ribbonPink: 'rafts_rust', petalRed: 'leafLight' };
    const ids = new Map(Object.entries(MUTE).map(([a, b]) => [g.mat(a), g.mat(b)]));
    for (const { r } of Object.values(houses)) { const [[a0, b0], [a1, b1]] = r.corners; g.paint((x, y, z, id) => ids.get(id), [a0 - 2, WY, b0 - 2], [a1 + 2, r.ridge + 2, b1 + 2]); }
  }

  // one golden atap tone on every thatched roof: streaks running down the slope, a darker ridge cap, a ragged eave fringe
  for (const h of Object.values(houses)) if (h.roof !== 'tin') thatchHouseRoof(g, h.F, h.geo, h.seed);
  // weathered atap: a few moss patches on the old house roofs
  cover(g, { on: ['rafts_thatchGold', 'rafts_thatchStreak'], with: 'rafts_mossThatch', amount: 0.24, scale: 0.22, seed: 4 });

  // ---- the restaurant hub (deck x 43…59, z −12…4; fresh thatch, built after the moss); the shore walkway lands on its west rim
  const REST = { x0: 43, x1: 59, z0: -12, z1: 4 };
  restaurant(g, ctx, R.fork(1), REST);

  // ---- the spine: one smooth boardwalk from the north-east end, along the north porches, round the corner and south
  // past the restaurant and the west porches
  const ctrl = [[98, -18], [94, -19], [80, -21], [67, -22], [63, -20], [61, -14], [61, -2], [61, 14], [61, 28], [61, 36]];
  const spinePts = spline(ctrl.map(([x, z]) => [x, 0, z]), 4).map(([x, , z]) => [x, z]);
  walkway(g, spinePts, { y: DY, width: 3, every: 5, seed: 7 });
  walkway(g, [[51, -23], [57, -23], [61, -20]], { y: DY, width: 3, seed: 8 });          // h1's spur
  walkway(g, [[40, -5], [42, -5]], { y: DY, width: 3, rail: true, seed: 9 });            // shore landing (continues west)
  walkway(g, [[94, -34], [94, -36], [98, -36]], { y: DY, width: 1, seed: 10 });         // h4's back → fish cages
  for (const z of [-6, -4]) lanternPost(g, 42, z, 0, z < -5 ? -1 : 1, 6);              // lanterns at the landing

  // lantern posts along the spine's lagoon side, every ~11 voxels of length (drawn last, where the edge is free)
  const posts = [];
  {
    let acc = 6;
    for (let i = 1; i < spinePts.length; i++) {
      const [ax, az] = spinePts[i - 1], [bx, bz] = spinePts[i], L = Math.hypot(bx - ax, bz - az);
      acc += L;
      if (acc < 11) continue;
      acc = 0;
      const tx = (bx - ax) / L, tz = (bz - az) / L, nx = tz, nz = -tx;          // normal toward the lagoon side
      posts.push([Math.round(bx + nx * 1.2), Math.round(bz + nz * 1.2), Math.round(nx), Math.round(nz)]);
    }
  }

  // ---- boats: two long-tails nosed in at the spine in front of the restaurant (+ one kayak at h4, one paddling)
  longtail(g, [70, WY, -11], { dir: '-x', length: 14, shaft: 4, passengers: 0, driver: 'sit', seed: 31, paint: 'longtailHullDark' });
  longtail(g, [70, WY, -5], { dir: '-x', length: 14, shaft: 4, passengers: 0, driver: false, canopy: 'awningCream', seed: 32, paint: 'ribbonRed' });

  // ---- a noodle boat at the spine in front of the restaurant: the cook stands over a steaming pot, a customer eats
  {
    rowboat(g, [65, WY, 5], '+z', { half: 6 });
    person(g, [65, DY, 6], { side: '-x', seed: 43, shirt: 'rafts_cloth', pants: 'rafts_flagBlue' });
    hat(g, [65, DY, 6], '-x', false);
    for (const z of [2, 3]) { g.set(65, DY, z, g.mat('thaiClay')); g.set(65, DY + 1, z, g.mat('rafts_flame')); g.set(65, DY + 2, z, g.mat('metal')); g.set(65, DY + 3, z, g.mat('metal')); }
    g.set(65, DY + 3, 2, g.mat('rafts_line'));
    for (const [z, m] of [[8, 'rafts_cloth'], [9, 'rafts_cloth'], [10, 'rafts_greens']]) { g.set(66, DY, z, g.mat('plankDark')); g.set(66, DY + 1, z, g.mat(m)); }
    for (const [x, z, m] of [[64, 9, 'rafts_mango'], [65, 9, 'rafts_rambutan'], [64, 10, 'rafts_rambutan'], [65, 10, 'rafts_mango']]) { g.set(x, DY, z, g.mat('bambooMatDark')); g.set(x, DY + 1, z, g.mat(m)); }
    ctx.emit('particles', { preset: 'mist', count: 10, size: 3.5, opacity: 0.25, glow: 1, colors: ['#ffffff', '#f6efe4'], speed: 0.15, box: [[64.5, DY + 4, 2], [65.5, DY + 12, 3.5]] });   // a soft steam plume
    person(g, [62, DY + 1, 6], { pose: 'sit', side: '+x', seed: 44, shirt: 'rafts_cream', pants: 'rafts_indigo' });
    g.set(63, DY + 3, 7, g.mat('rafts_cloth')); g.set(63, DY + 4, 7, g.mat('rafts_curry'));
  }

  // ---- the monk's morning alms at h6: a monk in saffron (bare right shoulder, darker sash) in his dark rowing boat holds
  // out a steel alms bowl; grandma, in white, kneels on the spine and lifts a ladle of rice between their hands
  {
    rowboat(g, [66, WY, 31], '+z', { half: 5, hull: 'rafts_hullDark', dark: 'rafts_hullDark', keel: 'rafts_hullDark' });
    const sk = g.palette.color('#c08a5e');
    person(g, [67, DY, 31], { pose: 'sit', side: '-x', seed: 41, shirt: 'rafts_robe', pants: 'rafts_robe', skin: sk, hair: sk });
    g.set(67, DY + 2, 31, sk);                                                                           // bare right shoulder
    g.set(67, DY + 2, 32, g.mat('rafts_sash')); g.set(67, DY + 1, 31, g.mat('rafts_sash'));              // diagonal sash
    g.set(65, DY + 2, 31, g.mat('metal')); g.set(65, DY + 2, 32, g.mat('metal'));                        // steel alms bowl, held out
    g.set(66, DY + 2, 31, sk); g.set(66, DY + 2, 32, sk);                                                // his hands round it
    for (let k = 0; k < 5; k++) g.set(68 + (k >> 1), DY - (k >> 2), 34 + k, g.mat('plankDark'));         // oar trailing
    person(g, [62, DY + 1, 31], { pose: 'sit', side: '+x', seed: 42, shirt: 'rafts_cream', pants: 'rafts_indigo', hair: g.palette.color('#e2ddd4') });
    g.set(63, DY + 3, 31, g.palette.color('#b88660'));                                                   // her hand…
    g.set(64, DY + 3, 31, g.mat('rafts_rice'));                                                          // …tipping rice into the bowl
    g.set(62, DY + 1, 33, g.mat('bambooMatDark')); g.set(62, DY + 2, 33, g.mat('rafts_rice')); g.set(62, DY + 1, 34, g.mat('marigold'));   // rice basket + garland
  }

  // ---- lagoon life: the swim raft (a kid poised on the board, another mid-leap over open water), swimmers, a tube
  swimRaft(g, 84, 8);
  kid(g, [91, DY + 3, 10], '+x', { seed: 2, pose: 'jump', shirt: 'rafts_cream' });                    // arms up on the board end
  cannonball(g, 98, WY + 4, 11);                                                                         // …and one mid-air, tucked into a cannonball
  foamRing(g, 99, 12, 2);                                                                                // the water ringing below him
  ctx.emit('particles', { preset: 'cubes', colors: ['#ffffff', '#dff3ef'], shadow: false, size: 0.3, count: 16, speed: 1, box: [[98, WY + 1, 11], [100, WY + 5, 13]] });
  {                                                                                                      // a kid sitting on the raft's edge, legs over the water
    const sk = g.palette.color('#b07850'), hr = g.palette.color('#1e1612');
    for (const x of [88, 89]) for (const [y, z, m] of [[DY + 1, 13, 'rafts_shorts'], [DY + 1, 14, 'rafts_shorts'], [DY, 14, sk], [DY + 2, 13, 'rafts_khaki'], [DY + 3, 13, 'rafts_khaki'], [DY + 4, 13, sk], [DY + 5, 13, hr], [DY + 4, 12, hr]])
      g.set(x, y, z, typeof m === 'string' ? g.mat(m) : m);
    for (const x of [87, 90]) { g.set(x, DY + 3, 13, g.mat('rafts_khaki')); g.set(x, DY + 2, 13, sk); }
  }
  swimmer(g, [90, WY, 18], '-x', { seed: 6, wave: true });
  swimmer(g, [80, WY, 13], '+z', { seed: 9, shirt: 'rafts_indigo' });
  g.torus([73.5, WY + 0.5, 10.5], 2, 0.8, 'rafts_tube');
  kid(g, [73, WY - 1, 10], '+z', { seed: 7, shirt: 'rafts_rust' });

  // ---- the swimming lagoon's float line: red and white buoys strung from the lotus corner to the sala raft
  {
    const line = spline([[88, 0, 38], [97, 0, 29], [102, 0, 15], [102, 0, 1], [99, 0, -8]], 8);
    let acc = 0, k = 0, prev = null;
    for (const [x, , z] of line) {
      if (prev) acc += Math.hypot(x - prev[0], z - prev[1]);
      prev = [x, z];
      if (acc < 2.6) continue;
      acc = 0;
      const bx = Math.round(x), bz = Math.round(z);
      if (bz > 38 || !isWater(g, bx, WY, bz)) continue;
      const m = g.mat(k++ % 2 ? 'templeWhite' : 'templeRed');
      g.set(bx, WY, bz, m); g.set(bx, DY, bz, m);
    }
  }

  // ---- lotus shallows in the lagoon's sheltered south-west corner; a few pads near the landing
  for (const [a, b, seed] of [[[71, 28], [78, 38], 3], [[76, 30], [83, 38], 11], [[81, 32], [89, 38], 17], [[71, 34], [86, 38], 23]])
    lilyPads(g, a, b, { y: WY, clusters: 3, flowers: 0.8, seed });
  lilyPads(g, [41, 6], [44, 12], { y: WY, clusters: 1, flowers: 1, seed: 5 });

  // ---- north porch stories ---------------------------------------------------------------------------------
  // h4: a hammock nap
  {
    const { F, geo } = houses.h4, n = geo.pv - geo.hv1 - 1;
    const sk = g.palette.color('#c08a60'), hr = g.palette.color('#2a1a10');
    for (let k = 0; k < n; k++) {
      const sag = Math.round(2 * Math.sin((Math.PI * (k + 0.5)) / n)), y = 2 + 3 - sag + 1, v = geo.hv1 + 1 + k;
      const m = k === 0 ? sk : k <= 2 ? 'rafts_cream' : 'rafts_indigo';
      F.set(geo.hu0, y, v, m); F.set(geo.hu0 + 1, y, v, m);
      if (k === 0) { F.set(geo.hu0, y + 1, v, hr); F.set(geo.hu0 + 1, y + 1, v, hr); }
      if (k === n - 1) { F.set(geo.hu0, y + 1, v, sk); F.set(geo.hu0 + 1, y + 1, v, sk); }
    }
  }
  // h2: tin roof with a solar panel; a fisherman on the spine's edge, line out in the lagoon
  {
    for (let x = 62; x <= 64; x++) for (let z = -33; z <= -31; z++) { const t = g.top(x, z); if (t > 5) g.set(x, t + 1, z, g.mat('rafts_solar')); }
    person(g, [70, DY + 1, -21], { pose: 'sit', side: '+z', seed: 61, shirt: 'rafts_indigo', pants: 'rafts_shorts', hat: 'rafts_hat' });
    for (let k = 0; k <= 5; k++) g.set(72, DY + 3 + k, -20 + k, g.mat('plankDark'));                  // rod
    for (let y = DY + 7; y >= DY; y--) g.set(72, y, -14, g.mat('rafts_line'));                         // line
    g.set(72, WY, -14, g.mat('rafts_chili')); g.set(72, WY + 1, -14, g.mat('rafts_cloth'));            // bobber
    g.set(71, DY + 1, -20, g.mat('bambooMatDark'));                                                     // fish basket
    // fish drying on a bamboo rack on the porch
    for (let x = 67; x <= 69; x++) { for (const z of [-27, -26]) g.set(x, DY + 2, z, g.mat(((x + z) & 1) ? 'rafts_fish' : 'bambooMat')); }
    for (const x of [67, 69]) g.set(x, DY + 1, -27, g.mat('bambooPoleDark'));
  }
  // h3's front deck: young men playing sepak takraw — a triangle, one mid bicycle-kick, the rattan ball in the air; a second
  // ball bobs in the lagoon beside the deck and a kid swims to fetch it
  {
    const x0 = 75, x1 = 86, z0 = -19, z1 = -14;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const rim = x === x0 || x === x1 || z === z1;
      if ((x - x0) % 3 !== 2 && (z - z0) % 3 !== 2) g.set(x, WY, z, g.mat('raftFloatDark'));
      g.set(x, DY, z, g.mat(rim ? 'plankDark' : (x & 1) ? 'plank' : 'plankLight'));
    }
    for (let x = x0 - 1; x <= x1 + 1; x++) { g.set(x, WY, z1 + 1, g.mat('bambooPole')); g.set(x, WY - 1, z1 + 1, g.mat('bambooPoleDark')); }
    for (let z = z0; z <= z1; z++) for (const x of [x0 - 1, x1 + 1]) { g.set(x, WY, z, g.mat('bambooPole')); g.set(x, WY - 1, z, g.mat('bambooPoleDark')); }
    player(g, [84, DY + 1, -15], '-x', { kick: true, shirt: 'rafts_rust' });                   // bicycle kick, open water behind him
    player(g, [77, DY + 1, -15], '+x', { ready: true, shirt: 'rafts_cream', skin: '#9a6440' });
    player(g, [78, DY + 1, -19], '+z', { ready: true, shirt: 'rafts_khaki', skin: '#b07a50' });
    takrawBall(g, 81, DY + 4, -17);                                           // the rattan ball, just above (and behind) the raised foot
    takrawBall(g, 89, WY, -16);                                               // the stray ball, half in the water
    swimmer(g, [92, WY, -16], '-x', { seed: 12, shirt: 'rafts_rust' });
  }
  // h4: a kayak tied alongside; h1: reading on the porch bench
  kayak(g, [102, WY, -28], { dir: '-z', people: 0, color: 'kayakOrange', seed: 6 });
  person(g, houses.h1.r.bench, { pose: 'sit', side: houses.h1.r.benchSide, seed: 64, shirt: 'rafts_khaki', pants: 'rafts_shorts' });
  // west porches: a mother on h5's bench watching the kids; an old man at h6's door; plants
  person(g, houses.h5.r.bench, { pose: 'sit', side: houses.h5.r.benchSide, seed: 65, shirt: 'rafts_cream', pants: 'rafts_brown' });
  person(g, houses.h6.r.bench, { pose: 'sit', side: houses.h6.r.benchSide, seed: 66, shirt: 'rafts_cloth', pants: 'rafts_shorts', hair: g.palette.color('#d8d4cc') });
  for (const [x, z] of [[58, 11], [58, 21], [58, 25], [58, 35]]) if (!g.get(x, DY + 1, z)) potPlant(g, x, DY + 1, z, R);

  // ---- the floating sala at the spine's north-east end: a red-and-gold pavilion facing the Three Brothers
  {
    const x0 = 98, x1 = 108, z0 = -19, z1 = -9;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const rim = x === x0 || x === x1 || z === z0 || z === z1;
      g.set(x, WY, z, g.mat((x - x0) % 3 === 2 ? 'raftFloatDark' : 'raftFloat'));
      g.set(x, DY, z, g.mat(rim ? 'plankDark' : (z & 1) ? 'plank' : 'plankLight'));
    }
    sala(g, [103, DY, -14], { side: '-z', w: 7, d: 7, postH: 6, raise: 1, steps: false, seed: 5 });
    person(g, [102, DY + 2, -17], { pose: 'sit', side: '-z', seed: 71, shirt: 'rafts_cloth', pants: 'rafts_shorts', hair: g.palette.color('#d8d4cc') });
    person(g, [104, DY + 2, -17], { pose: 'sit', side: '-z', seed: 72, shirt: 'rafts_rust', pants: 'rafts_brown' });
    for (const [x, z, k] of [[x0, z1, 'tall'], [x1, z1, 'leaf'], [x1, z0, 'tall']]) potPlant(g, x, DY + 1, z, R, k);
  }

  // ---- open water to the east: fish cages behind h4 (kingfisher perches)
  // (the east cage is the one the default camera sees past the sala: the monitor lies along its south rim)
  fishCage(g, 97, -39, 6); fishCage(g, 105, -39, 7);
  for (const x of [105, 111]) g.set(x, DY + 1, -33, 0);                      // the east cage's south posts: room for the monitor
  for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) g.set(108 + dx, WY, -36 + dz, g.mat('rafts_foam'));
  g.set(108, WY + 2, -36, g.mat('rafts_fish')); g.set(108, WY + 3, -35, g.mat('rafts_fish')); g.set(108, WY + 2, -37, g.mat('rafts_fish'));   // a silver barb mid-leap

  for (const [x, z, ax, az] of posts) if (!g.get(x, DY + 1, z) && !g.get(x + ax, DY + 6, z + az) && x > 42 && !(x === 80 && z === -20)) lanternPost(g, x, z, ax, az, 6);   // (no post behind the takraw ball)

  // morning haze drifting low over the open water to the east
  ctx.emit('particles', { preset: 'mist', count: 22, size: 11, sizeJitter: 0.3, opacity: 0.12, glow: 1, colors: ['#ffffff', '#f6efe4'], motion: 'drift', speed: 0.04, turbulence: 0.3, box: [[100, 1, -30], [118, 3, 38]] });

  // ---- actors ------------------------------------------------------------------------------------------------
  ctx.emit('actors', { ...LIFE.fish, count: 10, area: [[64, -16], [104, 30]] });
  ctx.emit('actors', { ...LIFE.walker, count: 1, behavior: 'path', path: [[60.5, -12], [60.5, 34]] });
  ctx.emit('actors', { ...LIFE.walker, count: 1, behavior: 'path', path: [[60.5, -13], [64, -20], [72, -22.6], [80, -22], [93, -20], [80, -22], [72, -22.6], [64, -20]] });
  ctx.emit('actors', { creature: 'kayakBoat', on: 'water', behavior: 'path', count: 1, path: [[108, -3], [116, 0], [116, 26], [110, 33], [108, 12]] });
  ctx.emit('actors', { creature: 'cat', behavior: 'still', scale: 0.3, options: { coat: 'tuxedo' }, spots: [[66.5, houses.h2.r.ridge + 1, -32.5, 41]] });   // watching the takraw
  ctx.emit('actors', { ...LIFE.monitor, spots: [[108.5, DY + 1, -32.5, 270]] });                   // along the east cage's south rim
  ctx.emit('actors', { creature: 'dog', behavior: 'still', options: { coat: 'golden' }, spots: [[44.5, DY + 1, -2.5, 90]] });
  ctx.emit('actors', { ...LIFE.kingfisher, spots: [[97.5, DY + 2, -38.5], [102.5, DY + 2, -38.5], [105.5, DY + 2, -38.5], [111.5, DY + 2, -38.5]] });   // the cages' back posts
  ctx.emit('actors', { ...LIFE.dragonfly, count: 3, area: [[71, 30], [88, 38]] });

  // ---- points of interest (tour order; labels ≤ 32 characters)
  ctx.emit('poi', { label: 'Floating restaurant & noodles', icon: '🍜', target: [61, 6, 2], zoom: 8 });
  ctx.emit('poi', { label: "A monk's morning alms", icon: '🙏', target: [65, 4, 31], zoom: 12 });
  ctx.emit('poi', { label: 'Takraw on the deck', icon: '🏐', target: [81, 5, -16], zoom: 11 });
  ctx.emit('poi', { label: 'Kids at the swim raft', icon: '🤸', target: [88, 3, 9], zoom: 10 });
  ctx.emit('poi', { label: 'Floating sala & fish cages', icon: '🛕', target: [94, 5, -25], zoom: 8.5 });
}
