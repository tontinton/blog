// trail (SW, x −120…−41, z 40…119) — the rainforest floor near the camera, and the tour's opening stop. The road
// comes in from the front under the KHAO SOK gate to the park ranger station (stilts, spirit house, campfire with a
// kettle) at the 8 o'clock flag-raising (anthem: everyone stands still). The nature trail loops past the rafflesia
// in bloom (boardwalk + guided group), over a cut fallen log, THROUGH a hollow strangler fig and along the forest
// edge back home; a spur crosses the river on an arched footbridge. Tall rainforest at the back and along the river,
// low undergrowth (Kerriodoxa fan palms, rattan, ferns) at the front so the floor reads from the camera.
// Life: hikers, a boar with striped piglets under the forest, a python on the river bank, a pit viper on the log, a
// muntjac stalked by the piece's only tiger (half hidden in leaves; a camera trap is watching), the ranger's dog,
// butterflies, a kingfisher on the bridge, dragonflies.
import { ground } from '../base.js';
import { LIFE, columnAt } from '../layout.js';
import {
  rainforest, jungleTree, strangler, bamboo, banana, fern, treeFern, alocasia, rafflesia, heliconia, pitcherPlant,
  fallenLog, undergrowth, epiphytes, lianas, rattan, spiritHouse, parkSign, person, rock, bench, campfire, hash3,
} from '../../lib/index.js';
import { motorbike, hikerStep, rafflesiaBud, fanPalm, clearCorridor, sealOverhead, TRAIL_MATS, trailCells, thin, rotateLoop, thaiFlag, rangerStation, footbridge, boardwalk, marker, infoBoard, ranger } from './trail-parts.js';

const K = (x, z) => x + ',' + z;

export default function build(g, ctx) {
  for (const [k, v] of Object.entries(TRAIL_MATS)) ctx.P.add(k, v);
  ground(g, ctx);
  ctx.clip = true;
  const land = (x, z) => columnAt(x, z).kind === 'land';
  const gy = (x, z) => { const c = columnAt(x, z); return c.kind === 'land' ? c.top : c.water; };
  const blocked = new Set();                       // cells kept clear of undergrowth (paths, structures, hero spots)
  const block = (x0, z0, x1, z1) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) blocked.add(K(x, z)); };
  const blockR = (cx, cz, r) => { for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) if (Math.hypot(x - cx, z - cz) <= r) blocked.add(K(x, z)); };
  const fill = (x, z, y, m) => { for (let yy = gy(x, z); yy < y; yy++) g.set(x, yy, z, 'soil'); g.set(x, y, z, m); };   // raise a column to y

  // ---- 1. the trail ---------------------------------------------------------------------------------------
  // main loop (counter-clockwise seen from above): plaza → west past the sign → the rafflesia boardwalk → north
  // over the cut log → through the strangler fig → back south-east through the understory → plaza. (The return leg
  // runs where the gate's board hides it from the default camera: hikers must never appear to walk along its top.)
  const LOOP = [
    [-61, 104], [-69, 104], [-77, 101], [-85, 100], [-93, 100], [-101, 99], [-107, 95], [-108, 89], [-108, 83],
    [-107, 77], [-104, 72], [-100, 71], [-96, 75], [-95, 82], [-92, 88], [-86, 91], [-79, 92], [-73, 93], [-67, 98],
    [-61, 104],
  ];
  const SPUR = [[-73, 93], [-69, 88], [-68, 82], [-68, 76], [-64, 68], [-58, 61], [-53, 58], [-49, 56], [-49, 50], [-49, 44], [-49, 40]];
  const ACCESS = [[-68, 119], [-68, 113], [-64, 108]];                    // from the road, under the gate, into the plaza
  const loop = trailCells(LOOP, 3), spur = trailCells(SPUR, 3), access = trailCells(ACCESS, 3);
  const pathCells = new Map([...loop.cells, ...spur.cells, ...access.cells]);
  // plaza (packed red-brown earth) in front of the station
  const PLAZA = { x: -56, z: 104, rx: 10, rz: 7.5 };
  for (let x = PLAZA.x - 12; x <= PLAZA.x + 12; x++) for (let z = PLAZA.z - 9; z <= PLAZA.z + 9; z++) {
    const e = ((x - PLAZA.x) / PLAZA.rx) ** 2 + ((z - PLAZA.z) / PLAZA.rz) ** 2 + (hash3(x, 0, z, 9) - 0.5) * 0.25;
    if (e <= 1 && land(x, z)) { g.set(x, gy(x, z), z, e > 0.8 ? 'trail_path' : 'trail_plaza'); blocked.add(K(x, z)); }
  }
  for (const c of pathCells.values()) {
    if (!land(c.x, c.z)) continue;
    const y = gy(c.x, c.z), h = hash3(c.x, y, c.z, 4);
    if (g.get(c.x, y, c.z) === g.mat('trail_plaza')) continue;
    g.set(c.x, y, c.z, c.d > 1.1 ? (h < 0.5 ? 'trail_pathEdge' : 'trail_path') : h < 0.06 ? 'trail_root' : 'trail_path');
  }
  for (const c of pathCells.values()) blockR(c.x, c.z, 2.2);
  // log steps across the trail where it climbs; markers every ~24 voxels
  const line = loop.line;
  for (let i = 4; i < line.length - 1; i += 1) {
    const [x, z] = line[i], [px, pz] = line[i - 4];
    const y = gy(Math.round(x), Math.round(z)), py = gy(Math.round(px), Math.round(pz));
    if (y - py >= 2 && i % 5 === 0) {
      const dx = x - px, dz = z - pz, L = Math.hypot(dx, dz), ax = -dz / L, az = dx / L;
      for (let s = -1.5; s <= 1.5; s += 0.5) { const cx = Math.round(x + ax * s), cz = Math.round(z + az * s); if (land(cx, cz)) g.set(cx, gy(cx, cz) + 1, cz, 'log'); }
    }
  }
  for (let i = 12; i < line.length; i += 26) {
    const [x, z] = line[i], [nx, nz] = line[Math.min(line.length - 1, i + 1)], L = Math.hypot(nx - x, nz - z) || 1;
    const mx = Math.round(x + (-(nz - z) / L) * 2.6), mz = Math.round(z + ((nx - x) / L) * 2.6);
    if (land(mx, mz) && !pathCells.has(K(mx, mz))) marker(g, mx, gy(mx, mz) + 1, mz);
  }

  // ---- 2. ranger station, flag, spirit house, park sign -----------------------------------------------------
  let stY = -Infinity;
  for (let x = -60; x <= -48; x++) for (let z = 84; z <= 95; z++) stY = Math.max(stY, gy(x, z));
  const st = rangerStation(g, [-60, stY, 84], { w: 13, d: 9, veranda: 3, stilt: 4 });
  block(-62, 82, -45, 97);
  // kalae: crossed carved boards at both gable apexes (northern Thai houses)
  for (const xe of [-62, -46]) {
    let zt = 89, ty = -Infinity;
    for (let z = 84; z <= 95; z++) { const t = g.top(xe, z); if (t > ty) { ty = t; zt = z; } }
    for (let k = 1; k <= 3; k++) { g.set(xe, ty + k, zt - k + 1, 'trail_teak'); g.set(xe, ty + k, zt + k, 'trail_teak'); }
  }
  // 8 o'clock flag-raising: the anthem plays, the flag is 2/3 up the pole, a ranger hauls the halyard and everyone
  // on the plaza stands still — the veranda ranger at attention, two hikers frozen mid-step
  const fY = gy(-47, 110);
  thaiFlag(g, [-47, fY, 110], { height: 17, w: 9, dir: -1, raise: 0.62, halyard: fY + 6 });
  ranger(g, [-48, fY + 1, 112], '-z', 'wave', 9);                       // hauling the rope on the camera side of the pole
  ranger(g, [-53, gy(-53, 111) + 1, 111], '+x', 'stand', 11);            // two rangers lined up at attention, facing the pole
  ranger(g, [-53, gy(-53, 114) + 1, 114], '+x', 'stand', 13);
  ranger(g, [st.stairX + 1, st.floor + 1, st.z1 - 1], '+z', 'stand', 3); // at attention on the veranda, facing the flag
  // leech socks drying over the veranda rail, rubber boots at the foot of the stairs
  for (const x of [-59, -58, -50, -49]) for (const [dy, dz] of [[2, 0], [2, 1], [1, 1], [0, 1]]) g.set(x, st.floor + dy, st.z1 + dz, 'trail_sock');
  { const [bxs, , bzs] = st.stairFoot; for (const x of [bxs - 3, bxs - 2, bxs + 3, bxs + 4]) { const y = gy(x, bzs) + 1; g.set(x, y, bzs, 'trail_boot'); g.set(x, y + 1, bzs, 'trail_boot'); g.set(x, y, bzs + 1, 'trail_boot'); } }
  hikerStep(g, [-56, gy(-56, 104) + 1, 104], { side: '+x', shirt: 'awningBlue', pack: 'awningRed', hair: 'barkDark' });
  hikerStep(g, [-53, gy(-53, 101) + 1, 101], { side: '+z', shirt: 'awningYellow', hat: 'trail_hatKhaki', pack: 'trail_olive' });
  block(-50, 108, -46, 112);
  const shX = -47, shZ = 99, sh = spiritHouse(g, [shX, gy(shX, shZ) + 1, shZ], { side: '-x', seed: 5 });
  block(shX - 5, shZ - 3, shX + 2, shZ + 3);
  person(g, [shX - 6, gy(shX - 6, shZ) + 1, shZ - 1], { side: '+x', seed: 21 });   // a visitor paying respects
  // plaza life: a hiker resting on a bench with her pack, the ranger's motorbike, marigolds round the flagpole
  bench(g, [-63, gy(-63, 111) + 1, 111], '-z', { length: 3, leg: 'beam', seat: 'plankDark' });
  person(g, [-63, gy(-63, 111) + 1, 111], { side: '-z', pose: 'sit', seed: 52 });
  g.box([-60, gy(-60, 111) + 1, 111], [-60, gy(-60, 111) + 2, 111], 'awningRed'); g.set(-60, gy(-60, 111) + 3, 111, 'trail_olive');
  motorbike(g, [-62, gy(-62, 90) + 1, 90], '+z');
  for (const [dx, dz] of [[2, -1], [2, 0], [2, 1], [-1, -2], [1, -2]]) g.set(-47 + dx, gy(-47 + dx, 110 + dz) + 1, 110 + dz, (dx + dz) & 1 ? 'marigold' : 'petalRed');
  block(-65, 109, -46, 116);
  // breakfast on the plaza: a campfire with a kettle on a tripod by the bench, a thin plume of smoke
  const cf = [-61, gy(-61, 108) + 1, 108];
  campfire(g, cf, { radius: 1.6, stone: 'limestoneDark', log: 'log' });
  for (const [dx, dz] of [[-2, -1], [2, -1], [1, 2]]) g.line([cf[0] + dx, cf[1], cf[2] + dz], [cf[0], cf[1] + 5, cf[2]], 'beam', { mode: 'keep' });
  g.set(cf[0], cf[1] + 3, cf[2], 'metalDark'); g.set(cf[0], cf[1] + 4, cf[2], 'metal');
  block(cf[0] - 4, cf[2] - 3, cf[0] + 3, cf[2] + 3);
  ctx.emit('particles', { preset: 'smoke', count: 26, size: 1.5, opacity: 0.32, speed: 0.12, box: [[cf[0] - 1, cf[1] + 5, cf[2] - 1], [cf[0] + 1, cf[1] + 20, cf[2] + 1]] });
  // the park gate: the KHAO SOK title board faces the camera over the road into the plaza (walkers pass under it)
  const GX = -68, GZ = 116, gY = Math.max(gy(GX - 10, GZ), gy(GX + 10, GZ), gy(GX, GZ)) + 1;
  parkSign(g, [GX, gY, GZ], { text: 'KHAO\nSOK', side: '+z', raised: false, lift: 9 });
  g.box([GX - 2, gY, GZ + 1], [GX + 2, gY + 1, GZ + 2], 0);                    // the planter parts for the road
  // board + roof as one solid run (no air gap between them): the walkers' height field then passes under the
  // gate (≥ 9 headroom) instead of stepping onto its roof
  g.box([GX - 11, gY + 24, GZ - 1], [GX + 11, gY + 25, GZ], 'thatchPalmDark');
  // the board's back (seen from the forest side) is painted as the park's trail map
  for (let x = GX - 8; x <= GX + 8; x++) for (let y = gY + 10; y <= gY + 22; y++) g.set(x, y, GZ - 1, 'trail_mapGreen');
  for (let k = 0; k < 40; k++) {                                               // dotted yellow loop trail
    const a = (k / 40) * Math.PI * 2, x = Math.round(GX + Math.cos(a) * 5.5), y = Math.round(gY + 16 + Math.sin(a) * 4);
    if (k % 2 === 0) g.set(x, y, GZ - 1, 'ribbonYellow');
  }
  for (let i = 0; i <= 6; i++) g.set(GX + 8 - i, gY + 22 - Math.round(i * 0.9), GZ - 1, 'trail_mapBlue');   // the river
  g.set(GX - 4, gY + 13, GZ - 1, 'trail_markRed'); g.set(GX - 4, gY + 14, GZ - 1, 'trail_markRed');       // you are here
  for (const x of [GX - 10, GX + 10]) for (let y = gy(x, GZ) + 1; y < gY; y++) g.set(x, y, GZ, 'bark');   // posts down to the ground
  block(GX - 12, GZ - 4, GX + 12, 119);
  // trail map board at the plaza's west exit
  const P_ = 'trail_mapGreen', T_ = 'trail_path', W_ = 'trail_mapBlue', X_ = 'trail_markRed';
  infoBoard(g, [-65, gy(-65, 99) + 1, 99], '+z', [
    [P_, P_, P_, W_, W_],
    [P_, T_, T_, T_, W_],
    [T_, P_, X_, P_, T_],
    [P_, T_, T_, T_, P_],
  ]);
  block(-66, 98, -58, 100);

  // ---- 3. the rafflesia clearing + boardwalk ----------------------------------------------------------------
  const FLOWERS = [
    { x: -90, z: 108, d: 11, rot: 18, buds: 3, seed: 7 },                  // the hero bloom
    { x: -78, z: 111, d: 9, rot: 60, buds: 1, seed: 12 },
    { x: -99, z: 113, d: 4, bud: true },                                  // a closed bud: the next bloom
  ];
  for (const f of FLOWERS) {                                             // level a pad for each flower (fill up)
    const r = f.bud ? 4 : f.d / 2 + 2.5;
    let top = -Infinity;
    for (let x = Math.floor(f.x - r); x <= f.x + r; x++) for (let z = Math.floor(f.z - r); z <= f.z + r; z++) if (Math.hypot(x - f.x, z - f.z) <= r && land(x, z)) top = Math.max(top, gy(x, z));
    for (let x = Math.floor(f.x - r); x <= f.x + r; x++) for (let z = Math.floor(f.z - r); z <= f.z + r; z++) {
      if (Math.hypot(x - f.x, z - f.z) > r || !land(x, z) || pathCells.has(K(x, z))) continue;
      fill(x, z, top, hash3(x, 1, z, 5) < 0.55 ? 'floorLitter' : 'floorMoss');
    }
    f.y = top + 1;
    blockR(f.x, f.z, r + 1);
  }
  // boardwalk along the clearing's north side (the trail runs on it), rope rail toward the flowers
  const bw = boardwalk(g, -98, -84, 98, 102, (x, z) => g.top(x, z));
  const bwAt = bw.yAt;
  for (const [x, s] of [[-99, 1], [-83, -1]]) for (let z = 99; z <= 101; z++) if (g.top(x, z) < bwAt(x + s) - 1) g.set(x, bwAt(x + s) - 1, z, 'plankDark');   // a step up onto the deck
  infoBoard(g, [-95, bwAt(-95) + 1, 98], '+z', [
    ['trail_markWhite', 'rafflesia', 'rafflesia', 'trail_markWhite'],
    ['rafflesia', 'rafflesiaCore', 'rafflesiaSpot', 'rafflesia'],
    ['trail_markWhite', 'rafflesia', 'rafflesia', 'trail_markWhite'],
  ]);
  // the guided group stands on the boardwalk's back row (z 98), clear of the hikers' walking line along z ≈ 100
  ranger(g, [-88, bwAt(-88) + 1, 98], '+z', 'wave', 5);                     // the guide pointing at the bloom
  person(g, [-85, bwAt(-85) + 1, 98], { side: '+z', seed: 31 });
  person(g, [-97, bwAt(-97) + 1, 98], { side: '+z', seed: 61 });

  // ---- 4. the cut fallen log on the west leg + boulders ------------------------------------------------------
  const logY = (x, z) => gy(x, z) + 1;
  const logA = fallenLog(g, [-112, logY(-112, 86), 86], [-119, logY(-119, 81), 81], { radius: 2.1, hollow: true, fungi: 4, ferns: 1, seed: 4 });
  const logB = fallenLog(g, [-104, logY(-104, 86), 86], [-97, logY(-97, 85), 85], { radius: 2.3, fungi: 4, ferns: 1, mushrooms: 3, seed: 9 });
  block(-120, 78, -90, 90);
  const ROCKS = [[-117, 103, 3], [-118, 93, 2], [-59, 70, 2.6]];
  for (const [x, z, r] of ROCKS) { rock(g, [x, gy(x, z) + 1, z], { radius: r, stone: ['limestoneDark', 'limestone', 'limestoneLight'], moss: 'floorMoss', seed: x * 7 + z }); blockR(x, z, r + 1); }

  // ---- 5. hero trees: the strangler fig over the trail, mid-canopy trees ------------------------------------
  const FIG = [-100, 71];
  const fig = strangler(g, [FIG[0], gy(...FIG) + 1, FIG[1]], { height: 38, door: true, doorAngle: 0.9, aerial: 12, fruit: false, seed: 17 });   // the door faces the camera
  // carve the trail through the hollow column: an arched tunnel (8–9 headroom) wherever the path passes
  for (const c of loop.cells.values()) {
    if (Math.hypot(c.x - FIG[0], c.z - FIG[1]) > 9) continue;
    const y0 = gy(c.x, c.z) + 1, hgt = c.d < 1.4 ? 10 : 8;
    for (let y = y0; y < y0 + hgt; y++) g.set(c.x, y, c.z, 0);
  }
  // dark earth inside the hollow and darker roots framing the two doorways, so the arch reads as an opening
  for (const c of loop.cells.values()) {
    const r = Math.hypot(c.x - FIG[0], c.z - FIG[1]);
    if (r > 8) continue;
    const y0 = gy(c.x, c.z);
    if (r < 5.5) g.set(c.x, y0, c.z, hash3(c.x, 1, c.z, 6) < 0.5 ? 'soilDark' : 'trail_root');
    for (let y = y0 + 1; y < y0 + 11; y++) for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const id = g.get(c.x + i, y, c.z + j);
      if (id === g.mat('figRoot')) g.set(c.x + i, y, c.z + j, 'figRootDark');
    }
  }
  blockR(FIG[0], FIG[1], 7);
  const MID = [
    { p: [-55, 80], h: 18, style: 'spreading', cr: 6.5, flowers: 'flameFlower' },   // the station's shade tree: flame of the forest
    { p: [-57, 71], h: 23, style: 'tall' }, { p: [-116, 72], h: 17, style: 'round' }, { p: [-116, 99], h: 13, style: 'round' },
  ];
  const treeRes = [];
  for (const [i, t] of MID.entries()) {
    const [x, z] = t.p;
    treeRes.push(jungleTree(g, [x, gy(x, z) + 1, z], { height: t.h, style: t.style, crownRadius: t.cr, flowers: t.flowers, flowerAmount: 0.4, seed: 100 + i * 13 }));
    blockR(x, z, 2);
  }

  // ---- 6. the rainforest: back of the box and along the river ---------------------------------------------
  const avoid = [[[-126, 67], [-36, 80]], [[-108, 60], [-92, 80]], [[-60, 49], [-36, 66]], [[-53, 38], [-36, 49]]];
  for (const [x, z] of thin(spur.line, 3)) avoid.push([[x - 3, z - 3], [x + 3, z + 3]]);
  const forest = rainforest(g, [-126, 40], [-36, 80], {
    border: false, avoid, height: [16, 26], emergents: [], overhang: 2, edge: 6, flowering: 0, seed: 4242,
  });

  { const x = -106, z = 49;                                            // a darker round giant instead of a pale umbrella
    jungleTree(g, [x, gy(x, z) + 1, z], { height: 34, style: 'round', crownRadius: 8, bias: -0.1, trunk: ['barkDark', 'bark'], leaves: ['canopyBlue', 'jungleLeafDark', 'jungleLeaf', 'jungleLeafLight'], seed: 4949 }); }

  // ---- 7. hero plants: bamboo, bananas, tree ferns, the rafflesias ------------------------------------------
  for (const [x, z, h, s] of [[-65, 51, 18, 1], [-67, 61, 15, 2]]) { bamboo(g, [x, gy(x, z) + 1, z], { height: h, culms: 11, seed: s * 31 }); blockR(x, z, 2.5); }
  // bananas by the station (a ranger's patch), tree ferns where they frame the trail without hiding the floor
  for (const [x, z, s] of [[-47, 83, 1], [-63, 82, 3]]) { banana(g, [x, gy(x, z) + 1, z], { seed: s * 17, fruit: s % 2 === 1 }); blockR(x, z, 2); }
  for (const [x, z, s] of [[-116, 97, 1], [-62, 84, 5], [-91, 66, 8]]) { treeFern(g, [x, gy(x, z) + 1, z], { height: 7 + (s % 3), seed: s * 23 }); blockR(x, z, 2); }
  for (const f of FLOWERS) {
    const o = { diameter: f.d, rotation: f.rot, buds: f.buds, seed: f.seed };
    if (f.bud) rafflesiaBud(g, [f.x, f.y, f.z]);
    else f.res = rafflesia(g, [f.x, f.y, f.z], o);
  }

  // ---- 8. the front-left thicket: a tiger lying in wait behind big leaves, watching a muntjac --------------
  const TIGER = [-111, 110];
  // cover on the camera side: only the striped head and a strip of flank peek out between the leaves
  for (const [x, z, k] of [[-116, 110, 'a'], [-114, 116, 'a'], [-100, 118, 'A'], [-112, 115, 'F'], [-109, 115, 'c'], [-106, 110, 'g'], [-112, 106, 'f'], [-117, 115, 'h']]) {
    const p = [x, gy(x, z) + 1, z];
    if (k === 'a') alocasia(g, p, { count: 5, height: 5.5, length: [5, 6], seed: x * 3 + z });
    else if (k === 'A') alocasia(g, p, { count: 4, height: 4.5, length: [4, 5], seed: 31 });
    else if (k === 'h') heliconia(g, p, { height: 5, seed: x + z });
    else if (k === 'F') fern(g, p, { radius: 3.2, height: 3.5, seed: 17 });
    else if (k === 'c') alocasia(g, p, { count: 4, height: 5, length: [4.5, 5.5], seed: 77 });        // hides the rump from the camera
    else if (k === 'g') fern(g, p, { radius: 2.8, height: 3, seed: 23 });                             // and the shoulder
    else fern(g, p, { radius: 3.2, height: 2.6, seed: x - z });
  }
  blockR(TIGER[0], TIGER[1], 5.5);
  // pugmarks in the mud: from the trail by the camera trap into the thicket
  for (let x = -108; x <= -104; x++) for (let z = 96; z <= 100; z++) if (!pathCells.has(K(x, z)) || hash3(x, 2, z, 8) < 0.7) g.set(x, gy(x, z), z, 'trail_mud');
  for (const [px, pz] of [[-106, 98], [-107, 100.5], [-107.5, 103], [-109, 105.5], [-109.5, 108]]) {
    const x = Math.round(px), z = Math.round(pz);
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.set(x + i, gy(x + i, z + j), z + j, 'trail_print');
    for (const [i, j] of [[-1, 2], [0, 2], [1, 2], [2, 2]]) if ((i + x) % 2 === 0 || j) g.set(x + i, gy(x + i, z + j), z + j, 'trail_print');
    block(x - 1, z, x + 2, z + 2);
  }
  block(-108, 101, -104, 108);                                          // the muntjac's patch

  // a ranger's camera trap strapped to the inthanin trunk, pointed at the thicket (it has caught something…)
  { const cx = -116, cz = 99, cy = gy(cx, cz) + 3;
    g.set(cx, cy, cz + 1, 'trail_olive'); g.set(cx, cy + 1, cz + 1, 'trail_olive'); g.set(cx, cy, cz + 2, 'metalDark'); g.set(cx, cy + 1, cz + 2, 'trail_led');
    g.set(cx - 1, cy + 1, cz + 1, 'fiberRope'); g.set(cx + 1, cy + 1, cz + 1, 'fiberRope'); }

  // ---- 9. understory: accents along the trail, then the fill ----------------------------------------------
  // Khao Sok's own white-elephant fan palms and rattan clumps along the front of the trail
  for (const [x, z, s, L] of [[-75, 109, 1, 4], [-100, 92, 2, 5]]) { fanPalm(g, [x, gy(x, z) + 1, z], { trunk: 3, length: L, seed: s * 7 }); blockR(x, z, L + 0.5); }
  for (const [x, z, a, h] of [[-79, 96, 0, 7], [-115, 106, 180, 8], [-80, 84, 180, 9], [-56, 75, 0, 9]]) { rattan(g, [x, gy(x, z) + 1, z], { height: h, angle: a, stems: 2, seed: x * 5 - z }); blockR(x, z, 2); }
  for (const [x, z, s] of [[-64, 76, 5], [-78, 87, 6], [-75, 80, 3], [-84, 96, 2]]) heliconia(g, [x, gy(x, z) + 1, z], { height: 5, form: s % 2 ? 'upright' : 'hanging', seed: s * 41 });
  for (const [x, z, s] of [[-110, 101, 1], [-74, 106, 2], [-113, 93, 3]]) pitcherPlant(g, [x, gy(x, z) + 1, z], { count: 5, big: 1, seed: s * 7 });
  const ground_ = ['floor', 'floorLitter', 'floorMoss', 'bank'];
  const avoidU = (x, z) => blocked.has(K(x, z));
  // the front band stays low (ferns, tufts, flowers) so the forest floor and the trail read from the camera
  // low zones (the front band, the sight line to the fig's door, round the plaza) get only ferns, tufts and flowers
  const low = (x, z) => z >= 103 || (x <= -80 && z >= 74 && z <= 97) || (x > -72 && z > 92);
  undergrowth(g, [-120, 72], [-41, 119], { on: ground_, density: 0.75, avoid: (x, z) => avoidU(x, z) || !low(x, z), seed: 78, scale: 0.8, mix: { alocasia: 0, heliconia: 0, seedling: 0.8, flower: 0.9, mushroom: 0.6 } });
  undergrowth(g, [-120, 40], [-41, 119], { on: ground_, density: 0.7, avoid: (x, z) => avoidU(x, z) || low(x, z), seed: 77, mix: { treeFern: 0.12, pitcher: 0.08, heliconia: 0.25 } });

  // ---- 10. epiphytes + lianas on the big trees ---------------------------------------------------------------
  epiphytes(g, { area: [[-120, 0, 60], [-41, 70, 119]], on: ['barkPale', 'barkPaleDark', 'barkPaleLight', 'figRoot', 'figRootDark', 'log', 'treeFernTrunk', 'jungleBarkMoss'], density: 0.1, seed: 5 });
  lianas(g, [...fig.limbs.slice(0, 5), ...treeRes.flatMap((t) => t.limbs.slice(0, 1))], { seed: 8, connect: 0.25, dangle: 0.3, chance: 0.7 });
  // a curtain of lianas hanging from the forest edge facing the trail
  const edgeLimbs = forest.trees.filter((t) => t.base[2] >= 55 && t.base[0] < -66).flatMap((t) => t.limbs.filter((l) => l[2] > t.base[2]).slice(0, 2));
  lianas(g, edgeLimbs, { seed: 11, connect: 0.2, dangle: 0.35, chance: 0.8, leaves: 0.08 });

  // ---- 11. the footbridge over the river (spur) --------------------------------------------------------------
  const bx = -49, bza = 41, bzb = 55;
  const br = footbridge(g, bx, bza, bzb, { w: 3, arch: 3, ya: gy(bx, bza) + 1, yb: gy(bx, bzb) + 1 });

  // ---- 12. life ----------------------------------------------------------------------------------------------
  // hikers on the loop (the shared walker system: each at its own pace) and two crossing the river on the spur,
  // coming in from the road under the gate; the guided group itself stands on the rafflesia boardwalk
  const lp = thin(loop.line, 2.2);
  const s0 = lp.reduce((b, p, i) => (Math.hypot(p[0] + 72, p[1] - 103) < Math.hypot(lp[b][0] + 72, lp[b][1] - 103) ? i : b), 0);
  ctx.emit('actors', { ...LIFE.walker, behavior: 'path', path: rotateLoop(lp, s0, 0), count: 4 });
  const spurPath = thin(trailCells([[-68, 118], [-68, 113], [-64, 108], [-62, 104], [-67, 98], ...SPUR], 3).line, 2.5);
  ctx.emit('actors', { ...LIFE.walker, behavior: 'path', path: [...spurPath, ...spurPath.slice(1, -1).reverse()], count: 2 });
  // keep the walking lines free of overhanging leaves (the height field would put hikers on top of them)
  clearCorridor(g, rotateLoop(lp, s0, 0), gy);
  clearCorridor(g, spurPath, gy, { closed: false });
  for (const c of loop.cells.values()) if (c.d < 1.6 && Math.hypot(c.x - FIG[0], c.z - FIG[1]) <= 9) sealOverhead(g, c.x, c.z, gy(c.x, c.z));   // through the fig, not over it
  // the boar family roots along a game trail under the forest (a cleared loop: piglets follow the sow on the floor)
  const BOARS = [[-90, 63], [-95, 62], [-94, 59], [-88, 58], [-86, 61]];   // deep enough that they never seem to walk along the gate's roof
  clearCorridor(g, BOARS, gy, { r: 2.2, h: 9 });
  ctx.emit('actors', { creature: 'boar', id: 'trail_sow', behavior: 'path', path: BOARS });
  ctx.emit('actors', { creature: 'boar', options: { baby: true }, count: 3, behavior: 'follow', target: 'trail_sow', spacing: 1.6 });
  ctx.emit('actors', { creature: 'muntjac', behavior: 'still', spots: [[-105, gy(-105, 102) + 1, 102.5, 330]] });   // grazing, unaware
  ctx.emit('actors', { creature: 'tiger', behavior: 'still', spots: [[TIGER[0] + 0.5, gy(...TIGER) + 1, TIGER[1] + 0.5, 145]] });   // staring at the muntjac
  ctx.emit('actors', { creature: 'snake', options: { kind: 'viper' }, behavior: 'still', spots: [[logA.top[0] + 0.5, logA.top[1], logA.top[2] + 0.5, 235]] });
  ctx.emit('actors', { creature: 'snake', options: { kind: 'python' }, behavior: 'still', spots: [[-53.5, gy(-54, 56) + 1, 56.5, 120]] });
  ctx.emit('actors', { creature: 'dog', behavior: 'still', spots: [[-58.5, gy(-58, 111) + 1, 111.5, 250]] });
  ctx.emit('actors', { ...LIFE.butterfly, count: 5, area: [[-82, 78], [-72, 96]] });   // over the heliconias, not the bloom
  ctx.emit('actors', { ...LIFE.butterfly, count: 3, area: [[-66, 66], [-58, 76]] });
  ctx.emit('particles', { preset: 'cubes', colors: ['#1c1c1c', '#2c3b22'], shadow: false, size: 0.2, count: 10, turbulence: 2, glow: 0, box: [[FLOWERS[0].x - 2, FLOWERS[0].y + 1, FLOWERS[0].z - 2], [FLOWERS[0].x + 2, FLOWERS[0].y + 4, FLOWERS[0].z + 2]] });   // carrion flies
  ctx.emit('actors', { ...LIFE.kingfisher, spots: br.posts.filter((_, i) => i % 3 === 0).map((p) => [p[0] + 0.5, p[1] + 1, p[2] + 0.5]) });
  ctx.emit('actors', { ...LIFE.dragonfly, count: 2, area: [[-58, 42], [-44, 54]] });

  // morning air: leaves twirling down under the canopy, sunlit motes over the rafflesia clearing
  ctx.emit('particles', { preset: 'leaves', count: 46, shadow: false, colors: ['#c8a040', '#9ab040', '#7a8a30', '#b0703a'], box: [[-118, 8, 66], [-46, 32, 114]] });
  ctx.emit('particles', { preset: 'dust', count: 110, box: [[-106, 6, 96], [-70, 22, 117]] });
  ctx.emit('particles', { preset: 'mist', count: 16, motion: 'drift', size: 8, opacity: 0.1, glow: 1, colors: ['#ffffff', '#f6efe4'], speed: 0.04, box: [[-60, 3, 42], [-43, 5, 56]] });   // haze on the river

  // ---- 13. points of interest ----------------------------------------------------------------------------
  const F0 = FLOWERS[0];
  ctx.emit('poi', { label: 'Ranger station & park gate', icon: '🛖', target: [-58, 14, 106], zoom: 5 });   // opens the tour: 8 o'clock flag-raising
  ctx.emit('poi', { label: 'Rafflesia in bloom', icon: '🌺', target: [-90, 11, 106], zoom: 8, yaw: -25 });
  ctx.emit('poi', { label: 'Trail through a strangler fig', icon: '🌳', target: [-100, gy(-100, 71) + 8, 71], zoom: 6, yaw: -60 });
  ctx.emit('poi', { label: 'Footbridge over the river', icon: '🌉', target: [-49, 8, 48], zoom: 6, yaw: 70 });
  ctx.emit('poi', { label: 'Can you spot the tiger?', icon: '🐅', target: [-108, gy(-108, 107) + 2, 106], zoom: 10, yaw: -25 });
}
