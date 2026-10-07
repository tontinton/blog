// Family Autumn — the log cabin (cutaway: back + left walls), its cosy furniture, and (room-forest.js)
// the autumn forest around it. Owns: fire light + flicker, chimney smoke, embers, dust, falling leaves,
// the wall clock's pendulum (part), birds and squirrels outside.
import { VoxelGrid, noise, hash3, clamp } from '../lib/index.js';
import { buildForest, FOREST_MATERIALS, GROUND_Y } from './room-forest.js';

const W = (c, o = {}) => ({ color: c, jitter: 0.04, ...o });

export const MATERIALS = {
  ...FOREST_MATERIALS,
  // logs (warm honey/chestnut), chinking, end grain
  rmLogA: W('#b27a44', { jitter: 0.05, noise: { color: '#9a6638', scale: 0.22, amount: 0.6 } }),
  rmLogB: W('#c28a50', { jitter: 0.05, noise: { color: '#a87442', scale: 0.22, amount: 0.6 } }),
  rmLogC: W('#9c6a3c', { jitter: 0.05, noise: { color: '#845830', scale: 0.22, amount: 0.6 } }),
  rmChink: W('#4a3426', { jitter: 0.03 }),
  rmEnd: W('#e2bc82', { jitter: 0.05 }),
  rmEndRing: W('#b4824c', { jitter: 0.04 }),
  rmEndBark: W('#5c3a22', { jitter: 0.05 }), rmEndCore: W('#8a5a32', { jitter: 0.04 }),
  rmBeam: W('#5e3c22', { jitter: 0.05 }),
  // shingles on the eave stub
  rmShingleA: W('#6b5544', { jitter: 0.06 }), rmShingleB: W('#5a4636', { jitter: 0.06 }), rmShingleC: W('#7a6250', { jitter: 0.06 }),
  rmShingleMoss: W('#6f7a3c', { jitter: 0.08 }),
  // floor
  rmPlankA: W('#8a5232', { jitter: 0.045 }), rmPlankB: W('#7a462a', { jitter: 0.045 }), rmPlankC: W('#985c38', { jitter: 0.045 }),
  rmPlankSeam: W('#5a341e', { jitter: 0.03 }),
  // stones
  rmStoneA: W('#a6a39d', { jitter: 0.06 }), rmStoneB: W('#bdb8ae', { jitter: 0.06 }), rmStoneC: W('#8a8781', { jitter: 0.06 }),
  rmStoneD: W('#ae9c86', { jitter: 0.06 }), rmMortar: W('#4e4842', { jitter: 0.04 }),
  rmSoot: W('#2b2420', { jitter: 0.05 }), rmAsh: W('#6a5e56', { jitter: 0.08 }),
  rmHearth: W('#857d74', { jitter: 0.05, grid: 0.35 }),
  // fire
  rmFire: { color: '#3a1a08', emissiveColor: '#ffc040', emissive: 1.6, flicker: 0.4, flickerSpeed: 1.6 },
  rmFireCore: { color: '#3a1a08', emissiveColor: '#ffe080', emissive: 2.6, flicker: 0.4, flickerSpeed: 1.4, light: { color: '#ffa458', radius: 40, intensity: 0.5 } },
  rmFlame: { color: '#2a0e04', emissiveColor: '#ff8a18', emissive: 1.0, flicker: 0.5, flickerSpeed: 2.1 },
  rmFlameTip: { color: '#200804', emissiveColor: '#f05010', emissive: 0.85, flicker: 0.7, flickerSpeed: 2.6 },
  rmEmber: { color: '#2a0a04', emissiveColor: '#ff5010', emissive: 1.0, flicker: 0.35, flickerSpeed: 0.8 },
  rmCharLog: W('#3a2618', { jitter: 0.06 }),
  rmIron: W('#2e2a28', { roughness: 0.5, metalness: 0.6 }),
  // mantel + decor
  rmMantel: W('#6e4426', { jitter: 0.05, noise: { color: '#5a361e', scale: 0.3, amount: 0.6 } }),
  rmWax: W('#f4e8cc', { jitter: 0.02 }),
  rmCandleFlame: { color: '#ffc860', emissive: 2.6, flicker: 0.5, flickerSpeed: 2.4, light: { color: '#ffb060', radius: 9, intensity: 0.7 } },
  rmPumpkin: W('#e47a24', { jitter: 0.04 }), rmPumpkinDk: W('#c45e18', { jitter: 0.04 }),
  rmGourdW: W('#efe6d0', { jitter: 0.03 }), rmGourdG: W('#6a8040', { jitter: 0.04 }), rmGourdY: W('#e8b84a', { jitter: 0.04 }),
  rmStem: W('#5a4a2a'),
  rmLeafR: W('#b8402a', { jitter: 0.06 }), rmLeafO: W('#e07a2a', { jitter: 0.06 }), rmLeafY: W('#e8b040', { jitter: 0.06 }), rmLeafBr: W('#8a4e26', { jitter: 0.06 }),
  rmGold: W('#c9a050', { roughness: 0.35, metalness: 0.7 }),
  rmBrass: W('#b8904a', { roughness: 0.4, metalness: 0.6 }),
  rmPhotoA: W('#8aa0b8'), rmPhotoB: W('#e8c8a0'), rmPhotoC: W('#5a6a48'), rmPhotoD: W('#d8a070'),
  rmCanvasSky: W('#f0c890'), rmCanvasHill: W('#c86a34'), rmCanvasHill2: W('#8a4a2a'),
  // sofa: deep moss-green velvet
  rmSofa: W('#566b46', { jitter: 0.03, roughness: 0.95, noise: { color: '#4c603e', scale: 0.25, amount: 0.5 } }),
  rmSofaDk: W('#435636', { jitter: 0.03, roughness: 0.95 }),
  rmSofaLt: W('#677d54', { jitter: 0.03, roughness: 0.95 }),
  rmWoodDk: W('#3e2616', { jitter: 0.04 }),
  rmPillowRust: W('#b85a32', { jitter: 0.03, roughness: 1 }), rmPillowCream: W('#efe2c8', { jitter: 0.02, roughness: 1 }),
  rmPillowMust: W('#d8a038', { jitter: 0.03, roughness: 1 }), rmPillowNavy: W('#3a4866', { jitter: 0.03, roughness: 1 }),
  rmKnitA: W('#ece0c4', { jitter: 0.03, roughness: 1 }), rmKnitB: W('#d9c9a6', { jitter: 0.03, roughness: 1 }), rmKnitRust: W('#c06a3a', { jitter: 0.03, roughness: 1 }),
  // rug (braided oval) + pouf (mustard cable knit)
  rmRugRust: W('#a8482c', { jitter: 0.05, roughness: 1 }), rmRugCream: W('#e6d6b6', { jitter: 0.04, roughness: 1 }),
  rmRugMust: W('#d09a3a', { jitter: 0.05, roughness: 1 }), rmRugNavy: W('#3a4664', { jitter: 0.05, roughness: 1 }),
  rmRugRed: W('#7e2e24', { jitter: 0.05, roughness: 1 }),
  rmPoufA: W('#d39a3c', { jitter: 0.03, roughness: 1 }), rmPoufB: W('#bc8430', { jitter: 0.03, roughness: 1 }), rmPoufC: W('#e2ae52', { jitter: 0.03, roughness: 1 }),
  // window seat / trim / glass / curtains
  rmTrim: W('#6a4228', { jitter: 0.04 }), rmTrimLt: W('#80522f', { jitter: 0.04 }),
  rmCabinet: W('#8c5c34', { jitter: 0.04 }), rmCabinetDk: W('#6e4628', { jitter: 0.04 }),
  rmCushion: W('#e2d4b6', { jitter: 0.025, roughness: 1 }), rmCushionStripe: W('#b85a32', { jitter: 0.03, roughness: 1 }),
  rmGlass: { color: '#cfe6f0', kind: 'glass', opacity: 0.08, roughness: 0.05 },
  rmCurtain: W('#e8dcc2', { jitter: 0.03, roughness: 1 }), rmCurtainDk: W('#d4c6a8', { jitter: 0.03, roughness: 1 }),
  // books
  rmBook1: W('#a8402e'), rmBook2: W('#d8a03a'), rmBook3: W('#3a4a6a'), rmBook4: W('#e8dcc0'), rmBook5: W('#5a7a4a'),
  rmBook6: W('#7a3a4a'), rmBook7: W('#2e6a6a'), rmBook8: W('#c8703a'),
  // plants + pots
  rmPlantDk: W('#2f5a30', { jitter: 0.05 }), rmPlant: W('#3f7a3c', { jitter: 0.05 }), rmPlantLt: W('#68a04c', { jitter: 0.05 }),
  rmPot: W('#b8643c', { jitter: 0.04 }), rmPotDk: W('#9a4e2e', { jitter: 0.04 }), rmPotCream: W('#e8e0cc', { jitter: 0.03 }),
  rmSoil: W('#3e2a1c'),
  // lamps + lights
  rmShade: { color: '#e0b878', emissive: 0.15, jitter: 0.02, light: { color: '#ffc27a', radius: 14, intensity: 0.7 } },
  rmBulb: { color: '#fff0c8', emissive: 3, light: { color: '#ffc070', radius: 20, intensity: 0.6 } },
  rmFairy: { color: '#ffd68a', emissive: 6, flicker: 0.12, flickerSpeed: 0.5, light: { color: '#ffbf6a', radius: 6, intensity: 0.55 } },
  rmFairyB: { color: '#ffb870', emissive: 6, flicker: 0.12, flickerSpeed: 0.6, light: { color: '#ffa860', radius: 6, intensity: 0.5 } },
  rmWire: W('#3a3028'),
  // small stuff
  rmMugA: W('#efe6d4', { jitter: 0.02 }), rmMugB: W('#c0603a', { jitter: 0.02 }), rmCoffee: W('#3a2214'),
  rmBowl: W('#3a4a6a', { roughness: 0.4, metalness: 0.3 }), rmBowlRim: W('#e8e4dc'), rmKibble: W('#8a5a2a', { jitter: 0.1 }),
  rmYarnRed: W('#c0402a', { jitter: 0.06 }), rmYarnBlue: W('#5a7aa8', { jitter: 0.06 }), rmYarnMust: W('#d8a038', { jitter: 0.06 }),
  rmBasket: W('#b48a52', { jitter: 0.06, grid: 0.3 }), rmBasketDk: W('#8e6a3a', { jitter: 0.06 }),
  rmClockFace: W('#f2e8d2'), rmClockHand: W('#2a2420'),
  rmGingham: W('#e8e0d0'), rmGinghamDk: W('#9a8c80'), rmScarf: W('#c06a3a', { jitter: 0.04 }),
  rmBone: W('#efe6d2'),
  rmLavender: W('#8a70b0', { jitter: 0.06 }), rmWheat: W('#d8b860', { jitter: 0.06 }),
};

const N = noise(1701);
const LOGS = ['rmLogA', 'rmLogB', 'rmLogC'];
const PITCH = 5;

// ---------- log walls -------------------------------------------------------------------------------

// Map (u along the log, y, w across the wall) to grid coords for a wall running along `axis`.
const at = (axis, u, y, w) => (axis === 'x' ? [u, y, w] : [w, y, u]);

/**
 * A wall of stacked round-ish logs. axis: direction the logs run. c: centre of the 3-thick slab (across).
 * span [u0, u1]: the wall itself (inner face at c+1, stepped profile + chinking).
 * ext [e0, e1]: log ends sticking out past the span (free-standing round logs with end grain).
 */
function logWall(g, { axis, c, u0, u1, e0, e1, y0 = 1, y1 = 40, yOff = 0, seed = 0, skip, flush }) {
  for (let y = y0; y <= y1; y++) {
    const k = Math.floor((y - 1 - yOff) / PITCH), r = ((y - 1 - yOff) % PITCH + PITCH) % PITCH;
    const shade = LOGS[Math.floor(hash3(k, seed, 7) * 3)];
    for (let u = e0; u <= e1; u++) {
      const inSpan = u >= u0 && u <= u1;
      const end = u === e0 || u === e1;
      let ds;
      if (inSpan) ds = r === 4 ? [[-1, 'chink']] : r === 0 || r === 3 ? [[-1, 'log'], [0, 'log']] : [[-1, 'log'], [0, 'log'], [1, 'log']];
      else ds = r === 4 ? [] : r === 0 || r === 3 ? [[0, 'log']] : [[-1, 'log'], [0, 'log'], [1, 'log']];
      for (const [d, kind] of ds) {
        const p = at(axis, u, y, c + d);
        if (skip && skip(p[0], p[1], p[2])) continue;
        let m = kind === 'chink' ? 'rmChink' : shade;
        if (!inSpan && end) m = d === 0 && (r === 1 || r === 2) ? (r === 1 ? 'rmEndRing' : 'rmEnd') : (r === 0 || r === 3) ? 'rmEnd' : 'rmEndRing';
        if (!inSpan && end && d !== 0 && (r === 1 || r === 2)) m = 'rmEnd';
        if (flush && u === u1) {
          // flush cut end: light end grain, darker ring at the rim, a dark heart; chinking recessed
          if (kind === 'chink') continue;
          m = r === 0 || r === 3 || d === 1 ? 'rmEndRing' : r === 2 && d === 0 ? 'rmEndCore' : 'rmEnd';
        }
        g.set(p[0], p[1], p[2], m);
      }
    }
  }
}

// A single round log (stubs at the cut corners, top plates): rows y0..y0+3 across centre c.
function roundLog(g, axis, u0, u1, y0, c, m, wide = 1) {
  for (let r = 0; r < 4; r++) {
    const half = r === 0 || r === 3 ? wide - 1 : wide;
    for (let u = u0; u <= u1; u++) for (let d = -half; d <= half; d++) {
      const end = u === u0 || u === u1;
      const p = at(axis, u, y0 + r, c + d);
      g.set(p[0], p[1], p[2], end ? (d === 0 && (r === 1 || r === 2) ? 'rmEndRing' : 'rmEnd') : m);
    }
  }
}

// River stones with recessed mortar: worley cells.
function stoneFn(seed, scale, shades, mortar = 'rmMortar', gap = 0.12) {
  const SN = noise(seed);
  return (x, y, z) => {
    const w = SN.worley3(x * scale, y * scale * 1.25, z * scale);
    if (w.f2 - w.f1 < gap) return mortar;
    return shades[Math.floor(w.id * shades.length)];
  };
}
const isMortar = (g, x, y, z) => g.get(x, y, z) === g.mat('rmMortar');

// ---------- build -----------------------------------------------------------------------------------

export function build(g, P, { L, stage }) {
  const { ROOM, FIRE, SOFA, SPOTS, WINDOW } = L;
  const id = (m) => g.mat(m);

  const dbg = new Set((typeof location !== 'undefined' ? new URLSearchParams(location.search).get('rmdbg') ?? '' : '').split(','));
  // ---- forest outside (ground at GROUND_Y) ----
  const forest = dbg.has('noforest') ? { particles: [], actors: [] } : buildForest(g, P, { L });

  // ---- foundation + floor slab ----
  const found = stoneFn(33, 0.22, ['rmStoneA', 'rmStoneB', 'rmStoneC', 'rmStoneD']);
  g.fill([-3, GROUND_Y - 1, -3], [63, -3, 51], found);
  // corner piers under the protruding log ends
  g.fill([-8, GROUND_Y - 1, -8], [-1, -3, -1], found);   // back-left corner pier (the only real corner)
  // recess the mortar on the visible faces
  for (let y = GROUND_Y; y <= -3; y++) {
    for (let x = -8; x <= 63; x++) for (const z of [51]) if (isMortar(g, x, y, z) && !g.has(x, y, z + 1)) g.del(x, y, z);
    for (let z = -8; z <= 51; z++) for (const x of [63]) if (isMortar(g, x, y, z) && !g.has(x + 1, y, z)) g.del(x, y, z);
  }
  // sill beams (floor joists' rim) and planks
  g.box([-3, -2, -3], [63, -2, 51], 'rmBeam');
  g.fill([0, -2, 51], [63, -2, 51], (x) => (x % 8 === 3 ? 'rmEnd' : 'rmBeam'));
  g.fill([63, -2, 0], [63, -2, 51], (x, y, z) => (z % 8 === 3 ? 'rmEnd' : 'rmBeam'));
  bricksFloor(g, [-3, -1, -3], [63, 0, 51]);

  // ---- log walls ----
  const winBack = (x, y, z) => x >= WINDOW.x0 && x <= WINDOW.x1 && y >= WINDOW.y0 && y <= WINDOW.y1;
  const LWIN = { z0: 33, z1: 42, y0: 14, y1: 27 };
  const winLeft = (x, y, z) => z >= LWIN.z0 && z <= LWIN.z1 && y >= LWIN.y0 && y <= LWIN.y1;
  logWall(g, { axis: 'x', c: -2, u0: -3, u1: 63, e0: -7, e1: 63, seed: 1, skip: winBack, flush: true });
  logWall(g, { axis: 'z', c: -2, u0: -3, u1: 51, e0: -7, e1: 51, seed: 2, yOff: 0, skip: winLeft, flush: true });
  // crossed stubs of the cut-away walls (classic notched corners), offset half a log
  for (let k = 0; k < 8; k++) {
    const y0 = 1 + k * PITCH + 2;
    if (y0 + 3 > 40) continue;
    roundLog(g, 'z', -8, -4, y0, -6, LOGS[k % 3]);        // back-left corner (hidden, for the silhouette)
    roundLog(g, 'x', -8, -4, y0, -6, LOGS[k % 3]);
  }
  // bottom sill stubs so the corners sit on the piers
  // top plate (a fatter log) on both walls
  roundLog(g, 'x', -9, 63, 41, -2, 'rmLogB', 2);
  roundLog(g, 'z', -9, 51, 41, -2, 'rmLogA', 2);

  // ---- windows ----
  windowBack(g, WINDOW);
  windowLeft(g, LWIN);

  // ---- eave stub with shingles (cut just inside the walls) ----
  eaves(g, FIRE);

  // ---- fireplace + chimney ----
  fireplace(g, FIRE);

  // ---- furniture ----
  if (!dbg.has('nofurn')) {
    sofa(g, SOFA);
    pouf(g, SPOTS.fatcat);
    windowSeat(g, WINDOW);
    frontRight(g);
  }
  rug(g);
  bookshelf(g);
  firewood(g);
  sideTable(g);
  snakePlant(g, [13, 1, 2]);
  wallDecor(g, LWIN);
  fairyLights(g);
  const clock = wallClock(g, P);

  // ---- light, particles ----
  const [fx, fy, fz] = FIRE.flame;
  const LP = [fx + 8, fy + 6, fz + 0.5];
  const lights = [{ type: 'point', position: LP, color: '#ffa860', intensity: 7, distance: 70, decay: 1.3 }];
  const particles = [
    { preset: 'embers', count: 26, box: [[1.5, 3, 14], [4.5, 13, 21]], speed: 0.5, size: 0.2 },
    { preset: 'smoke', count: 40, box: [[-5, 59, 14], [0, 84, 20]], size: 3.2, opacity: 0.5, speed: 0.12, colors: ['#e0d8d0', '#c0b8b0', '#a8a098'] },
    { preset: 'dust', count: 60, box: [[4, 4, 4], [62, 36, 50]], size: 0.14, opacity: 0.4, glow: 1.3 },
    { preset: 'smoke', count: 6, box: [[10.5, 10, 13.5], [11.5, 15, 14.5]], size: 0.45, opacity: 0.25, speed: 0.12, colors: ['#ffffff'], fade: 0.5 },
    ...forest.particles,
  ];

  return {
    parts: [clock.part],
    lights,
    particles,
    actors: forest.actors,
    update(t, parts, P, self) {
      const l = self.lightObjects?.[0];
      if (l) {
        const f = 0.82 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.1 + 1.3) + 0.05 * Math.sin(t * 2.1 + 0.4);
        l.intensity = 7 * f;
        l.color.setRGB(1, 0.6 + 0.08 * f, 0.33 + 0.06 * f);
        l.position.set(LP[0] + 0.3 * Math.sin(t * 3.1), LP[1] + 0.4 * Math.sin(t * 5.3), LP[2] + 0.5 * Math.sin(t * 2.3));
      }
      if (parts.pendulum) parts.pendulum.rotation.x = Math.sin(t * Math.PI) * 0.22;
    },
  };
}

// ---------- pieces ------------------------------------------------------------------------------------

function bricksFloor(g, a, b) {
  // planks run along x, 3 wide, staggered joints, thin darker seams
  const shades = ['rmPlankA', 'rmPlankB', 'rmPlankC'];
  g.fill(a, b, (x, y, z) => {
    const row = Math.floor((z + 3) / 3);
    const len = 11 + Math.floor(hash3(row, 0, 0, 5) * 6);
    const u = x + 3 + Math.floor(hash3(row, 1, 0, 5) * len);
    const col = Math.floor(u / len);
    if (y === 0 && (u % len === 0)) return 'rmPlankSeam';
    
    return shades[Math.floor(hash3(col, row, 0, 3) * 3)];
  });
}

function windowBack(g, Wn) {
  const { x0, x1, y0, y1 } = Wn;
  g.box([x0, y0, -4], [x1, y1, -1], 0);
  // deep reveal lined with trim, glass at the outer face, mullions
  g.box([x0 - 1, y0 - 1, -4], [x1 + 1, y0 - 1, 0], 'rmTrim');           // sill (sticks out 1 on both sides)
  for (const [x, z, m] of [[x0 + 1, -4, 'rmLeafO'], [x0 + 2, -4, 'rmLeafR'], [x0 + 6, -3, 'rmLeafY'], [x1 - 2, -4, 'rmLeafO'], [x1 - 1, -3, 'rmLeafBr'], [x0 + 9, -4, 'rmLeafR']]) g.set(x, y0, z, m);
  g.box([x0 - 2, y0 - 2, 0], [x1 + 1, y0 - 2, 0], 'rmTrimLt');          // apron lip
  g.box([x0 - 1, y1 + 1, -3], [x1 + 1, y1 + 1, -1], 'rmTrim');          // head
  g.box([x0 - 1, y0, -3], [x0 - 1, y1, -1], 'rmTrim');
  g.box([x1 + 1, y0, -3], [x1 + 1, y1, -1], 'rmTrim');
  // casing on the interior face
  g.box([x0 - 2, y1 + 1, -1], [x1 + 1, y1 + 2, -1], 'rmTrimLt');
  g.box([x0 - 2, y0 - 1, -1], [x0 - 2, y1 + 1, -1], 'rmTrimLt');
  const mx = Math.round((x0 + x1) / 2);
  g.box([mx, y0, -3], [mx, y1, -2], 'rmTrim');
  for (const y of [y0 + 6, y0 + 12]) g.box([x0, y, -3], [x1, y, -2], 'rmTrim');
  // little pots on the deep sill (z <= 0: outside the kitten's zone)
  succulent(g, [x0, y0, -1], 'rmPot');
  succulent(g, [x1, y0, -1], 'rmPotCream');
}

function windowLeft(g, Wn) {
  const { z0, z1, y0, y1 } = Wn;
  g.box([-4, y0, z0], [-1, y1, z1], 0);
  g.box([-3, y0 - 1, z0 - 1], [0, y0 - 1, z1 + 1], 'rmTrim');
  g.box([0, y0 - 2, z0 - 2], [0, y0 - 2, z1 + 2], 'rmTrimLt');
  g.box([-3, y1 + 1, z0 - 1], [-1, y1 + 1, z1 + 1], 'rmTrim');
  g.box([-3, y0, z0 - 1], [-1, y1, z0 - 1], 'rmTrim');
  g.box([-3, y0, z1 + 1], [-1, y1, z1 + 1], 'rmTrim');
  g.box([-1, y1 + 1, z0 - 2], [-1, y1 + 2, z1 + 2], 'rmTrimLt');
  g.box([-1, y0 - 1, z0 - 2], [-1, y1 + 1, z0 - 2], 'rmTrimLt');
  g.box([-1, y0 - 1, z1 + 2], [-1, y1 + 1, z1 + 2], 'rmTrimLt');
  const mz = Math.round((z0 + z1) / 2);
  g.box([-3, y0, mz], [-2, y1, mz], 'rmTrim');
  g.box([-3, y0 + 7, z0], [-2, y0 + 7, z1], 'rmTrim');
  // a trailing pothos on the sill
  g.cylinder([-1, y0, z0 + 2], 1, 2, 'rmPotCream');
  foliageBlob(g, [[-1, y0 + 3, z0 + 2.5, 1.8]], 77);
  for (const [dz, len] of [[1, 5], [3, 7], [4, 4]]) for (let i = 0; i < len; i++) g.set(0, y0 + 1 - i, z0 + dz + (i % 3 === 2 ? 1 : 0), i % 2 ? 'rmPlant' : 'rmPlantLt');
  // little pumpkin on the other side of the sill
  pumpkin(g, [-1, y0, z1 - 2], 1.3, 'rmGourdW');
}

function succulent(g, [x, y, z], pot) {
  g.box([x, y, z - 1], [x, y + 1, z], pot);
  g.set(x, y + 2, z, 'rmPlantLt'); g.set(x, y + 2, z - 1, 'rmPlant'); g.set(x, y + 3, z - 1, 'rmPlantLt');
}

function foliageBlob(g, blobs, seed, shades = ['rmPlantDk', 'rmPlant', 'rmPlantLt']) {
  const FN = noise(seed);
  for (const [cx, cy, cz, r] of blobs) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz) / r;
      const n = FN.simplex3(x * 0.5, y * 0.5, z * 0.5);
      if (d + n * 0.3 > 1) continue;
      const t = clamp((y - (cy - r)) / (2 * r) * 0.7 + n * 0.3 + (hash3(x, y, z, seed) - 0.5) * 0.3);
      g.put(x, y, z, shades[Math.min(shades.length - 1, Math.floor(t * shades.length))], 'keep');
    }
  }
}

function pumpkin(g, [x, y, z], r = 2, m = 'rmPumpkin', dk) {
  const dark = dk ?? (m === 'rmPumpkin' ? 'rmPumpkinDk' : m);
  const h = Math.max(1, r * 0.75);
  g.ellipsoid([x, y + h - 0.5, z], [r, h, r], (px, py, pz) => {
    const a = Math.atan2(pz - z, px - x);
    return Math.cos(a * 5) > 0.55 ? dark : m;
  });
  g.set(x, Math.round(y + 2 * h - 0.5), z, 'rmStem');
  if (r >= 2) g.set(x, Math.round(y + 2 * h + 0.5), z, 'rmStem');
}

function eaves(g, FIRE) {
  const shades = ['rmShingleA', 'rmShingleB', 'rmShingleC'];
  const LN = noise(91);
  const top = (x, z) => {
    const a = z <= 1 && z >= -10 && x >= -10 && x <= 64 ? z + 10 : Infinity;
    const b = x <= 1 && x >= -10 && z >= -10 && z <= 52 ? x + 10 : Infinity;
    const m = Math.min(a, b);
    return m === Infinity ? null : 45 + Math.floor(m / 2);
  };
  for (let z = -10; z <= 52; z++) for (let x = -10; x <= 64; x++) {
    const h = top(x, z);
    if (h == null) continue;
    if (x >= -9 && x <= 2 && z >= FIRE.z0 + 3 && z <= FIRE.z1 - 3) continue; // chimney hole
    const row = Math.floor((h - 45));
    const along = (z <= 1 && x > 1) ? x : z;
    const sh = shades[Math.floor(hash3(Math.floor((along + (row % 2) * 2) / 4), row, 0, 4) * 3)];
    const moss = LN.simplex2(x * 0.15, z * 0.15) > 0.45;
    const edge = z === -10 || x === -10 || z >= 0 && x > 1 || x >= 0 && z > 1;
    const leaf = hash3(x, z, 1, 12) < (edge ? 0.22 : 0.12);
    g.set(x, h, z, leaf ? ['rmLeafO', 'rmLeafR', 'rmLeafY'][Math.floor(hash3(x, z, 2) * 3)] : moss ? 'rmShingleMoss' : sh);
    g.set(x, h - 1, z, 'rmBeam');
    // blocking under the roof over the walls; rafters elsewhere
    const overWallB = z >= -3 && z <= -1 && x >= -3, overWallL = x >= -3 && x <= -1 && z >= -3;
    if (overWallB || overWallL) for (let y = 45; y < h - 1; y++) g.set(x, y, z, 'rmBeam');
    else if ((z <= 1 && x > 1 ? x : z) % 6 === 0) for (let y = Math.max(45, h - 3); y < h - 1; y++) g.set(x, y, z, 'rmLogC');
  }
}

function fireplace(g, F) {
  const { z0, z1, depth, opening: O, mantelY } = F;
  const SH = ['rmStoneA', 'rmStoneB', 'rmStoneC', 'rmStoneD', 'rmStoneB'];
  // big rounded river stones: 2D cells on the front face (z, y), extruded through the depth
  const SN = noise(55);
  const stoneAt = (u, y) => {
    const w = SN.worley3(u * 0.24, y * 0.3, 0.5);
    return w.f2 - w.f1 < 0.11 ? 'rmMortar' : SH[Math.floor(w.id * SH.length)];
  };
  // hearth: raised flagstone slab in front
  g.fill([0, 1, z0 - 1], [depth + 2, 1, z1 + 1], (x, y, z) => ((Math.floor((z - z0 + 1) / 4) + Math.floor(x / 4)) % 2 ? 'rmHearth' : 'rmStoneC'));
  for (let z = z0 - 1; z <= z1 + 1; z++) if ((z - z0 + 1) % 4 === 3) g.set(depth + 2, 1, z, 'rmMortar');
  // stone surround up to the mantel
  g.fill([0, 2, z0], [depth - 1, mantelY - 2, z1], (x, y, z) => (x === depth - 1 ? stoneAt(z, y) : z === z0 || z === z1 ? stoneAt(x + 40, y) : stoneAt(z, y)));
  // arched opening + firebox
  const cz = (O.z0 + O.z1) / 2, hw = (O.z1 - O.z0) / 2 + 0.5;
  const archTop = (z) => O.y1 - 2 + Math.round(2.4 * Math.sqrt(Math.max(0, 1 - ((z - cz) / hw) ** 2)));
  for (let z = O.z0; z <= O.z1; z++) for (let y = 2; y <= archTop(z); y++) for (let x = 1; x <= depth - 1; x++) g.del(x, y, z);
  // soot-blackened firebox walls (back + sides + ceiling)
  for (let y = 2; y <= O.y1 + 1; y++) for (let z = O.z0 - 1; z <= O.z1 + 1; z++) for (let x = 0; x <= depth - 2; x++)
    if (g.has(x, y, z) && (!g.has(x + 1, y, z) || !g.has(x, y, z + 1) || !g.has(x, y, z - 1) || !g.has(x, y - 1, z))) g.set(x, y, z, 'rmSoot');
  // voussoirs: a ring of light wedge stones around the arch, with a keystone
  for (let z = O.z0 - 1; z <= O.z1 + 1; z++) {
    const top = z < O.z0 || z > O.z1 ? O.y1 - 3 : archTop(z);
    for (let y = 2; y <= top + 1; y++) {
      const x = depth - 1;
      if (!g.has(x, y, z)) continue;
      const edge = !g.has(x, y - 1, z) || !g.has(x, y, z - 1) || !g.has(x, y, z + 1) || (y === top + 1);
      if (!edge) continue;
      g.set(x, y, z, (z + y) % 3 === 0 ? 'rmMortar' : 'rmStoneB');
      if (y === top + 1) g.set(x, y + 1, z, (z % 2) ? 'rmStoneB' : 'rmStoneA');
    }
  }
  g.box([depth - 1, O.y1 + 1, Math.floor(cz)], [depth, O.y1 + 2, Math.ceil(cz)], 'rmStoneD');   // keystone (proud)
  // recess mortar on the faces → stones bulge
  for (let y = 2; y <= mantelY - 2; y++) {
    for (let z = z0; z <= z1; z++) if (isMortar(g, depth - 1, y, z)) g.del(depth - 1, y, z);
    for (let x = 0; x < depth; x++) { if (isMortar(g, x, y, z0)) g.del(x, y, z0); if (isMortar(g, x, y, z1)) g.del(x, y, z1); }
  }
  // firebox floor: ash bed, iron grate, crossed logs, embers
  g.box([1, 1, O.z0], [depth - 1, 1, O.z1], 'rmAsh');
  for (let z = O.z0 + 1; z <= O.z1 - 1; z++) g.set(3, 1, z, (z % 2) ? 'rmEmber' : 'rmAsh');
  // andirons at the ends (keep the logs visible)
  for (const z of [O.z0 + 1, O.z1 - 1]) { g.box([3, 2, z], [3, 4, z], 'rmIron'); g.set(4, 2, z, 'rmIron'); g.set(3, 5, z, 'rmBrass'); }
  const fz = F.flame[2];
  // two logs along z + a crossing log on top, charred with glowing cracks
  g.box([1, 2, fz - 4], [2, 3, fz + 3], 'rmCharLog');
  g.box([2, 2, fz - 3], [3, 3, fz + 2], 'rmCharLog');
  g.box([1, 4, fz - 2], [2, 4, fz + 2], 'rmCharLog');
  for (const z of [fz - 4, fz + 3]) g.box([1, 2, z], [2, 3, z], 'rmEnd');
  for (const [x, y, z] of [[3, 2, fz - 2], [3, 3, fz], [3, 2, fz + 1], [2, 4, fz - 1], [2, 4, fz + 1], [3, 3, fz - 3]]) g.set(x, y, z, 'rmEmber');
  // flames: separate tongues licking up from the logs (yellow core, orange body, red tips)
  const tongues = [[2, fz - 3, 3], [2, fz - 1, 5], [2, fz + 1, 4], [2, fz + 2, 2], [1, fz, 4], [1, fz - 2, 3], [3, fz, 2]];
  for (const [x, z, h] of tongues) for (let i = 0; i < h; i++) {
    const y = 5 + i, f = (i + 0.5) / h;
    g.set(x, y, z, f < 0.35 ? 'rmFire' : f < 0.75 ? 'rmFlame' : 'rmFlameTip');
    if (i === 0) { g.set(x, y, z + 1, 'rmFlame', 'keep'); g.set(x, y, z - 1, 'rmFlame', 'keep'); }
  }
  g.set(2, 5, fz, 'rmFireCore'); g.set(2, 5, fz - 1, 'rmFireCore');
  // mantel: a thick rough-hewn beam with corbels
  g.box([0, mantelY - 1, z0 - 2], [depth + 1, mantelY, z1 + 2], 'rmMantel');
  g.box([depth + 1, mantelY - 1, z0 - 2], [depth + 1, mantelY - 1, z1 + 2], 'rmWoodDk');
  for (const z of [z0, z1]) { g.box([depth, mantelY - 3, z], [depth, mantelY - 2, z], 'rmMantel'); g.set(depth, mantelY - 4, z, 'rmMantel'); }
  // chimney breast above, set back
  const breast = (x, y, z) => stoneAt(x === depth - 2 ? z : z + 40 + x, y);
  g.fill([0, mantelY + 1, z0 + 2], [depth - 2, 40, z1 - 2], breast);
  for (let y = mantelY + 1; y <= 40; y++) {
    for (let z = z0 + 2; z <= z1 - 2; z++) if (isMortar(g, depth - 2, y, z)) g.del(depth - 2, y, z);
    for (let x = 0; x < depth - 2; x++) { if (isMortar(g, x, y, z0 + 2)) g.del(x, y, z0 + 2); if (isMortar(g, x, y, z1 - 2)) g.del(x, y, z1 - 2); }
  }
  // stack above the wall, through the eave
  const stack = stoneFn(56, 0.32, ['rmStoneA', 'rmStoneB', 'rmStoneC', 'rmStoneD']);
  g.fill([-8, 41, z0 + 4], [1, 57, z1 - 4], stack);
  g.fill([-8, -6, z0 + 3], [-4, 40, z1 - 3], stack);                 // exterior chimney down to the ground
  g.fill([-9, 58, z0 + 3], [2, 59, z1 - 3], (x, y, z) => (y === 59 ? 'rmStoneC' : 'rmStoneB'));
  g.box([-6, 58, z0 + 6], [-1, 59, z1 - 6], 0);
  g.box([-6, 56, z0 + 6], [-1, 57, z1 - 6], 'rmSoot');
  for (let y = 41; y <= 57; y++) for (let z = z0 + 4; z <= z1 - 4; z++) if (isMortar(g, 1, y, z)) g.del(1, y, z);
  for (let y = 41; y <= 57; y++) for (let x = -8; x <= 1; x++) if (isMortar(g, x, y, z1 - 4)) g.del(x, y, z1 - 4);

  // ---- mantel decor (y = mantelY + 1), in front of the breast (x 3..depth+1) ----
  const my = mantelY + 1;
  // a cluster of pillar candles at the left end
  for (const [x, z, h] of [[4, z0 - 1, 4], [5, z0, 2], [4, z0 + 1, 3]]) { g.box([x, my, z], [x, my + h - 1, z], 'rmWax'); g.set(x, my + h, z, 'rmCandleFlame'); }
  // framed photo leaning on the breast (us four… five)
  const pz = Math.round(cz) - 3;
  g.box([3, my, pz], [3, my + 6, pz + 6], 'rmGold');
  g.ascii([4, my + 5, pz + 1], `
    AAAAA
    ABABA
    CDCDC
    DDDDD
    DDDDD`, { A: 'rmPhotoA', B: 'rmPhotoB', C: 'rmPhotoC', D: 'rmPhotoD' }, { plane: 'zy' });
  g.box([4, my + 6, pz], [4, my + 6, pz + 6], 'rmGold'); g.box([4, my, pz], [4, my, pz + 6], 'rmGold');
  g.box([4, my, pz], [4, my + 6, pz], 'rmGold'); g.box([4, my, pz + 6], [4, my + 6, pz + 6], 'rmGold');
  // pumpkins + gourds at the right end
  pumpkin(g, [5, my, z1 - 2], 2);
  pumpkin(g, [5, my, z1 + 1], 1.2, 'rmGourdW');
  g.box([5, my, pz + 8], [6, my, pz + 8], 'rmGourdG'); g.set(5, my + 1, pz + 8, 'rmGourdY'); g.set(6, my, pz - 2, 'rmGourdY');
  // leaf garland: two-voxel-thick swags hanging off the mantel front, a mini pumpkin at each dip
  const gl = ['rmLeafR', 'rmLeafO', 'rmLeafY', 'rmLeafO', 'rmLeafBr'];
  const gx = depth + 2;
  for (let z = z0 - 2; z <= z1 + 2; z++) {
    const ph = ((z - z0 + 2) % 7) / 7;
    const sag = Math.round(Math.sin(ph * Math.PI) * 2.4);
    const y = mantelY - sag;
    const leaf = (k) => gl[Math.floor(hash3(z, k, 1, 3) * gl.length)];
    g.set(gx, y, z, leaf(1)); g.set(gx, y - 1, z, leaf(2));
    if (sag === 0) g.set(gx, y + 1, z, leaf(3));
    if (sag >= 2 && hash3(z, 9, 9) < 0.5) g.set(gx + 1, y - 1, z, leaf(4));
  }
  for (let z = z0 + 1; z <= z1; z += 7) { g.set(gx, mantelY - 4, z + 2, 'rmPumpkin'); g.set(gx, mantelY - 3, z + 2, 'rmStem'); }
  // autumn wreath on the chimney breast (a thick leafy ring + rust bow)
  const wx = depth - 1, wy = mantelY + 14, wz = cz + 0.5;
  for (let y = -6; y <= 6; y++) for (let z = -6; z <= 6; z++) {
    const d = Math.hypot(y, z);
    if (d < 3.2 || d > 5.6) continue;
    const a = Math.atan2(y, z);
    const seg = Math.floor((a + Math.PI) / (Math.PI * 2) * 14);
    const m = gl[(seg + (d > 4.6 ? 1 : 0)) % gl.length];
    g.set(wx, wy + y, Math.floor(wz + z), m);
    if (d > 3.8 && d < 5) g.set(wx + 1, wy + y, Math.floor(wz + z), gl[(seg + 2) % gl.length]);
  }
  g.box([wx + 2, wy - 5, Math.floor(wz) - 1], [wx + 2, wy - 4, Math.floor(wz) + 1], 'rmPillowRust');
  g.box([wx + 2, wy - 7, Math.floor(wz) - 1], [wx + 2, wy - 6, Math.floor(wz) - 1], 'rmPillowRust');
  g.box([wx + 2, wy - 7, Math.floor(wz) + 1], [wx + 2, wy - 6, Math.floor(wz) + 1], 'rmPillowRust');
}

function sofa(g, S) {
  const { x0, x1, z0, z1, seatTop } = S;
  const [a0, a1] = S.arms[0], [b0, b1] = S.arms[1];
  // feet
  for (const [x, z] of [[x0, z0], [x1 - 1, z0], [x0, z1 - 1], [x1 - 1, z1 - 1]]) g.box([x, 1, z], [x + 1, 1, z + 1], 'rmWoodDk');
  // base
  g.box([x0, 2, z0], [x1, seatTop - 2, z1], 'rmSofa');
  g.box([x0, 2, z1], [x1, 2, z1], 'rmSofaDk');                                 // shadowed lower edge
  // seat cushions (two, with a seam and piping)
  const mid = 31;
  for (const [c0, c1] of [[a1 + 1, mid], [mid + 1, b0 - 1]]) {
    g.box([c0, seatTop - 1, S.seatZ[0]], [c1, seatTop, z1], 'rmSofaLt');
    g.box([c0, seatTop - 1, z1], [c1, seatTop - 1, z1], 'rmSofa');
  }
  g.box([mid, seatTop, S.seatZ[0]], [mid + 1, seatTop, z1], 'rmSofaDk');
  g.box([mid, seatTop - 1, z1], [mid + 1, seatTop, z1], 'rmSofaDk');
  // back frame + puffy back cushions
  const bt = S.back.top;
  g.box([x0, 2, z0], [x1, bt - 1, z0 + 1], 'rmSofa');
  g.box([x0 + 1, bt, z0], [x1 - 1, bt, z0 + 1], 'rmSofa');
  g.box([x0, bt, z0], [x0, bt, z0], 0); g.box([x1, bt, z0], [x1, bt, z0], 0);
  for (const [c0, c1] of [[a1 + 1, mid], [mid + 1, b0 - 1]]) {
    g.box([c0, seatTop + 1, z0 + 2], [c1, bt - 2, S.back.z1], 'rmSofaLt');
    g.box([c0 + 1, bt - 1, z0 + 2], [c1 - 1, bt - 1, S.back.z1 - 1], 'rmSofaLt');
    g.box([c0, bt - 2, S.back.z1], [c1, bt - 2, S.back.z1], 'rmSofa');      // rounded top edge
    g.box([c0, seatTop + 1, S.back.z1], [c1, seatTop + 1, S.back.z1], 'rmSofa');
    for (let y = seatTop + 2; y <= bt - 3; y++) { g.set(c0, y, S.back.z1, 'rmSofa'); g.set(c1, y, S.back.z1, 'rmSofa'); }
    // tufting buttons
    for (const bx of [c0 + 3, Math.round((c0 + c1) / 2), c1 - 3]) g.set(bx, seatTop + 6, S.back.z1, 'rmSofaDk');
  }
  // rolled arms
  for (const [p0, p1] of [[a0, a1], [b0, b1]]) {
    g.box([p0, 2, z0], [p1, S.armTop - 1, z1], 'rmSofa');
    g.box([p0 + 1, S.armTop, z0], [p1 - 1, S.armTop, z1], 'rmSofaLt');
    g.box([p0, S.armTop - 1, z0], [p1, S.armTop - 1, z1], 'rmSofaLt');
    // scroll on the arm front
    g.box([p0, 3, z1], [p1, S.armTop - 2, z1], 'rmSofaDk');
    g.box([p0 + 1, 4, z1], [p1 - 1, S.armTop - 2, z1], 'rmSofa');
    g.set(Math.round((p0 + p1) / 2), S.armTop - 3, z1, 'rmSofaDk');
  }
  // pillows propped on the arms against the back (outside the sitters' seats)
  const pillow = (x0p, x1p, m, m2, pattern) => {
    for (let y = S.armTop + 1; y <= S.armTop + 6; y++) for (let z = z0 + 2; z <= z0 + 4; z++) for (let x = x0p; x <= x1p; x++) {
      const yy = y - S.armTop - 1, edge = (yy === 0 || yy === 5) && (x === x0p || x === x1p);
      if (edge || (z === z0 + 4 && (yy === 0 || yy === 5))) continue;
      g.set(x, y, z, pattern(x, yy, z) ? m2 : m);
    }
  };
  pillow(a0, a1, 'rmPillowRust', 'rmPillowCream', (x, y) => y === 2 || y === 3 ? (x % 2 === 0) : false);
  pillow(b0, b1, 'rmPillowCream', 'rmPillowMust', (x, y) => (x + y) % 2 === 0);  // gingham-ish check
  // chunky knit blanket draped over the right arm: folded over the top, hanging down the outside with a wavy hem
  const knit = (x, y, z) => ((y + (z % 2)) % 2 === 0 ? 'rmKnitA' : 'rmKnitB');
  for (let z = S.seatZ[0]; z <= z1 - 3; z++) {
    for (let x = b0; x <= b1; x++) g.set(x, S.armTop + 1, z, knit(x, S.armTop + 1, z));
    const hem = 3 + Math.round(1.5 + 1.5 * Math.sin(z * 1.3));
    for (let y = hem; y <= S.armTop + 1; y++) g.set(b1 + 1, y, z, y === hem + 2 ? 'rmKnitRust' : knit(b1 + 1, y, z));
    if (z % 2 === 0) g.set(b1 + 1, hem - 1, z, 'rmKnitB');
    if (z % 3 === 1) for (let y = hem + 1; y <= S.armTop - 1; y++) g.set(b1 + 2, y, z, knit(b1 + 2, y, z + 1));   // folds
  }
  g.box([b0, S.armTop + 2, S.seatZ[0] + 1], [b1, S.armTop + 2, S.seatZ[0] + 3], 'rmKnitB');                    // bunched fold on top
  for (let y = 6; y <= S.armTop; y++) g.set(b0 - 1, y, S.seatZ[0] + 1, 0, 'keep');
}

function rug(g) {
  // braided rag rug: a stadium (rounded oval) of even concentric bands
  const cz = 37, xa = 17, xb = 39, R = 13.6;
  const bands = ['rmRugRust', 'rmRugCream', 'rmRugMust', 'rmRugNavy', 'rmRugCream', 'rmRugRust', 'rmRugMust', 'rmRugCream', 'rmRugRed'];
  for (let z = Math.floor(cz - R); z <= cz + R; z++) for (let x = Math.floor(xa - R); x <= xb + R; x++) {
    const px = x + 0.5, pz = z + 0.5;
    const qx = Math.max(xa, Math.min(xb, px));
    const d = Math.hypot(px - qx, pz - (cz + 0.5));
    if (d > R) continue;
    const ring = Math.floor((R - d) / 1.75);
    let m = bands[Math.min(ring, bands.length - 1)];
    // braid: every few voxels along a band the neighbouring colour peeks through
    const t = Math.round((px - qx === 0 ? px : Math.atan2(pz - cz - 0.5, px - qx) * 8) + ring * 1.5);
    if (ring < bands.length - 1 && (R - d) % 1.75 > 1.2 && t % 3 === 0) m = bands[ring + 1];
    g.set(x, 1, z, m);
  }
}

function pouf(g, spot) {
  const cx = 44, cz = 35, r = 6;
  for (let y = 1; y <= 4; y++) {
    const rr = y === 4 ? r - 0.9 : y === 1 ? r - 0.5 : r;
    for (let z = cz - r - 1; z <= cz + r + 1; z++) for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      const d = Math.hypot(x + 0.5 - (cx + 0.5), z + 0.5 - (cz + 0.5));
      if (d > rr) continue;
      const a = Math.atan2(z - cz, x - cx);
      let m;
      if (y === 4) {
        const sp = Math.floor(d * 1.4 + a * 1.2) % 2 === 0;
        m = d < 1.2 ? 'rmPoufB' : sp ? 'rmPoufC' : 'rmPoufA';
      } else {
        const cable = Math.floor((a / (Math.PI * 2)) * 24 + (y % 2) * 0.5 + 100) % 3;
        m = cable === 0 ? 'rmPoufB' : cable === 1 ? 'rmPoufA' : 'rmPoufC';
      }
      g.set(x, y, z, m);
    }
  }
}

function windowSeat(g, Wn) {
  const x0 = 49, x1 = 63, z0 = 0, z1 = 10;
  g.box([x0, 1, z0], [x1, 7, z1], 'rmCabinet');
  g.box([x0, 1, z1], [x1, 1, z1], 'rmCabinetDk');                 // kick
  // panelled front (three doors) + knobs
  for (const [p0, p1] of [[x0 + 1, x0 + 4], [x0 + 6, x0 + 8], [x0 + 10, x1 - 1]]) {
    g.box([p0, 3, z1], [p1, 6, z1], 'rmCabinetDk');
    g.box([p0 + 1, 4, z1], [p1 - 1, 5, z1], 'rmCabinet');
    g.set(Math.round((p0 + p1) / 2), 4, z1 + 1, 'rmBrass');
  }
  g.box([x0, 7, z0], [x1, 7, z1 + 1], 'rmTrimLt');                 // top board with a lip
  // cushion (top y = 9) with rust piping
  g.box([x0, 8, z0], [x1, 9, z1], 'rmCushion');
  g.box([x0, 8, z1], [x1, 8, z1], 'rmCushionStripe');
  // end pillows (x = 49 and x = 63: outside the kitten's zone)
  for (let y = 10; y <= 14; y++) for (let z = 2; z <= 8; z++) {
    const e = (y === 10 || y === 14) && (z === 2 || z === 8);
    if (e) continue;
    g.set(x1, y, z, (y + z) % 2 === 0 ? 'rmPillowNavy' : 'rmPillowCream');
    if (y <= 13) g.set(x0, y, z, y === 12 ? 'rmPillowCream' : 'rmPillowRust');
  }
  // curtains (z = 0, gathered) on a brass rod, shelf above with plants
  g.box([45, 34, 0], [63, 34, 0], 'rmBrass');
  for (let y = 12; y <= 33; y++) {
    const tie = y === 20;
    for (let x = 46; x <= 49; x++) {
      if (tie && x === 46) continue;
      const fold = (x + (y > 20 ? 0 : 1)) % 2 === 0;
      g.set(x, y, 0, tie ? 'rmCushionStripe' : fold ? 'rmCurtainDk' : 'rmCurtain');
      if (fold && !tie) g.set(x, y, 1, 'rmCurtain');
    }
    for (let x = 62; x <= 63; x++) g.set(x, y, 0, tie ? 'rmCushionStripe' : (x + y) % 3 === 0 ? 'rmCurtainDk' : 'rmCurtain');
  }
  g.box([47, 36, 0], [63, 36, 2], 'rmTrim');
  g.box([48, 35, 0], [48, 35, 1], 'rmTrim'); g.box([63, 35, 0], [63, 35, 1], 'rmTrim');
  // shelf: trailing pothos, a jar, a small pumpkin
  g.cylinder([51, 37, 1], 1, 2, 'rmPot');
  foliageBlob(g, [[51.5, 40, 1.5, 2]], 41);
  for (const [dx, len] of [[0, 7], [1, 4], [-1, 5]]) for (let i = 0; i < len; i++) g.set(51 + dx + (i % 4 === 3 ? 1 : 0), 36 - i, 2 + (i > 2 ? 1 : 0), i % 2 ? 'rmPlant' : 'rmPlantLt');
  g.box([55, 37, 1], [56, 39, 1], 'rmPotCream'); g.box([55, 40, 1], [56, 40, 1], 'rmTrim');
  pumpkin(g, [59, 37, 1], 1.4);
  g.cylinder([61, 37, 0], 1, 2, 'rmPotDk');
  for (let i = 0; i < 4; i++) g.set(62, 39 + i, 1, 'rmPlantLt');
  g.set(61, 40, 1, 'rmPlant'); g.set(62, 41, 0, 'rmPlant');
}

function bookshelf(g) {
  const x0 = 0, x1 = 9, z0 = 0, z1 = 3, y1 = 32;
  const books = ['rmBook1', 'rmBook2', 'rmBook3', 'rmBook4', 'rmBook5', 'rmBook6', 'rmBook7', 'rmBook8'];
  g.box([x0, 1, z0], [x1, y1, z1], 'rmTrim');
  g.box([x0 + 1, 2, z0], [x1 - 1, y1 - 1, z1], 0);
  g.box([x0 + 1, 2, z0], [x1 - 1, y1 - 1, z0], 'rmCabinetDk');     // back panel
  const shelves = [2, 8, 14, 20, 26];
  let s = 1;
  for (const sy of shelves) {
    if (sy > 2) g.box([x0 + 1, sy - 1, z0], [x1 - 1, sy - 1, z1], 'rmTrim');
    let x = x0 + 1;
    while (x <= x1 - 1) {
      const r = hash3(x, sy, 0, s++);
      if (r < 0.1 && x < x1 - 2) {        // a gap with a little object
        const obj = hash3(x, sy, 1, 3);
        if (obj < 0.5) { g.set(x, sy, z0 + 2, 'rmPlantLt'); g.set(x, sy, z0 + 1, 'rmPot'); g.set(x, sy + 1, z0 + 1, 'rmPlant'); }
        else g.box([x, sy, z0 + 1], [x, sy + 1, z0 + 2], 'rmPotCream');
        x += 2; continue;
      }
      if (r < 0.22 && x < x1 - 2) {       // a horizontal stack
        for (let k = 0; k < 3; k++) g.box([x, sy + k, z0 + 1], [x + 2, sy + k, z1 - 1 + (k % 2 ? 0 : 1) - 1], books[Math.floor(hash3(x, sy + k, 2, s) * books.length)]);
        x += 4; continue;
      }
      const h = 3 + Math.floor(hash3(x, sy, 3, s) * 3);
      const m = books[Math.floor(hash3(x, sy, 4, s) * books.length)];
      g.box([x, sy, z0 + 1], [x, sy + Math.min(h, 4) - 1, z1 - 1], m);
      if (hash3(x, sy, 5, s) < 0.35) g.set(x, sy + Math.min(h, 4) - 2, z1 - 1, 'rmGold');   // spine band
      x++;
    }
  }
  // top: a plant and a basket
  g.cylinder([3, y1 + 1, 1], 1.2, 2, 'rmPot');
  foliageBlob(g, [[3.5, y1 + 5, 1.5, 2.6], [5, y1 + 4, 2, 1.8]], 42);
  for (const [dx, len] of [[-1, 6], [1, 9], [3, 5]]) for (let i = 0; i < len; i++) g.set(3 + dx, y1 + 2 - i, 4, i % 2 ? 'rmPlant' : 'rmPlantDk');
  g.box([6, y1 + 1, 0], [8, y1 + 3, 2], 'rmBasket');
  g.box([7, y1 + 3, 1], [7, y1 + 3, 1], 0);
}

function firewood(g) {
  // a little stacked woodpile beside the hearth (logs along x, end grain facing the room)
  const logs = [[4, 1], [6, 1], [5, 3], [7, 3], [6, 5]];
  for (const [z, y] of logs) {
    g.box([0, y, z - 1], [3, y + 1, z], LOGS[(z + y) % 3]);
    g.set(4, y, z - 1, 'rmEnd'); g.set(4, y + 1, z, 'rmEnd'); g.set(4, y + 1, z - 1, 'rmEndRing'); g.set(4, y, z, 'rmEndRing');
  }
  g.box([0, 1, 2], [0, 7, 2], 'rmIron'); g.box([0, 1, 8], [0, 7, 8], 'rmIron');
}

function snakePlant(g, [x, y, z]) {
  g.cylinder([x, y, z], 1.6, 4, 'rmPotDk', { r2: 1.4 });
  g.cylinder([x, y + 3, z], 1.2, 1, 'rmSoil');
  for (const [dx, dz, h, m] of [[0, 0, 11, 'rmPlant'], [1, 0, 8, 'rmPlantLt'], [-1, 1, 9, 'rmPlantDk'], [0, -1, 7, 'rmPlantLt'], [1, 1, 6, 'rmPlant'], [-1, -1, 5, 'rmPlant']])
    for (let i = 0; i < h; i++) g.set(x + dx, y + 4 + i, z + dz, i === h - 1 ? 'rmPlantLt' : (i % 3 === 1 ? 'rmGourdY' : m));
}

function sideTable(g) {
  const c = [11, 1, 8];
  g.cylinder([c[0], 1, c[2]], 1.6, 1, 'rmWoodDk');
  g.box([c[0], 2, c[2]], [c[0], 6, c[2]], 'rmWoodDk');
  g.cylinder([c[0], 7, c[2]], 3.2, 1, 'rmMantel');
  const y = 8;
  // table lamp: ceramic base + glowing drum shade
  g.box([c[0] - 1, y, c[2] - 1], [c[0], y + 2, c[2]], 'rmPotCream');
  g.box([c[0], y + 3, c[2]], [c[0], y + 4, c[2]], 'rmBrass');
  for (let yy = y + 5; yy <= y + 8; yy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const d = Math.hypot(dx, dz);
    if (d > 2.3) continue;
    if (d > 1.2 || yy === y + 8) g.set(c[0] + dx, yy, c[2] + dz, 'rmShade');
  }
  g.set(c[0], y + 5, c[2], 'rmBulb');
  // mugs (one with steam) + a book
  g.box([c[0] + 1, y, c[2] + 1], [c[0] + 2, y + 1, c[2] + 2], 'rmMugB'); g.set(c[0] + 1, y + 1, c[2] + 1, 'rmCoffee'); g.set(c[0] + 2, y + 1, c[2] + 1, 'rmCoffee'); g.set(c[0] + 1, y + 1, c[2] + 2, 'rmCoffee');
  g.set(c[0] + 3, y + 1, c[2] + 2, 'rmMugB');
  g.box([c[0] - 2, y, c[2] + 1], [c[0] - 1, y + 1, c[2] + 2], 'rmMugA'); g.set(c[0] - 2, y + 1, c[2] + 1, 'rmCoffee'); g.set(c[0] - 1, y + 1, c[2] + 2, 'rmCoffee');
  g.box([c[0] + 1, y, c[2] - 2], [c[0] + 2, y, c[2] - 1], 'rmBook2');
}

function wallDecor(g, LWIN) {
  // coat hooks near the front of the left wall: the gingham bucket hat + a rust scarf
  g.box([0, 25, 44], [0, 25, 51], 'rmTrim');
  for (const z of [47, 51]) g.set(1, 25, z, 'rmBrass');
  const ging = (y, z) => ((y + z) % 2 === 0 ? 'rmGingham' : 'rmGinghamDk');
  for (let y = 19; y <= 24; y++) for (let z = 44; z <= 50; z++) {
    const brim = y === 19;
    const crown = y >= 20 && z >= 45 && z <= 49 && !(y === 24 && (z === 45 || z === 49));
    if (brim) { g.set(1, y, z, ging(y, z)); g.set(0, y, z, ging(y, z + 1)); }
    if (crown) { g.set(0, y, z, ging(y, z + 1)); g.set(1, y, z, y === 20 ? 'rmScarf' : ging(y, z)); }
  }
  for (let y = 9; y <= 24; y++) g.set(1, y, 51, y % 4 === 0 ? 'rmKnitRust' : 'rmScarf');
  g.set(1, 8, 51, 'rmKnitB');
  // little shelf of preserves above the window, dried herb bundles hanging from the top plate
  g.box([0, 31, LWIN.z0 - 1], [1, 31, LWIN.z1 + 1], 'rmTrim');
  g.set(0, 30, LWIN.z0, 'rmTrim'); g.set(0, 30, LWIN.z1, 'rmTrim');
  [['rmPumpkin', 3], ['rmYarnRed', 2], ['rmGourdY', 3], ['rmPlant', 2], ['rmPillowRust', 3]].forEach(([m, h], i) => {
    const z = LWIN.z0 + i * 2;
    g.box([1, 32, z], [1, 31 + h, z], m); g.set(1, 32 + h, z, 'rmWax');
  });
  for (const [z, m, m2] of [[5, 'rmLavender', 'rmPlantLt'], [7, 'rmWheat', 'rmWheat'], [27, 'rmLavender', 'rmPlantLt'], [31, 'rmWheat', 'rmWheat']]) {
    g.box([1, 38, z], [1, 40, z], 'rmKnitB');
    g.box([1, 34, z], [1, 37, z], m); g.set(1, 35, z + 1, m); g.set(1, 35, z - 1, m); g.set(1, 37, z, m2); g.set(1, 33, z, m);
  }
  // framed picture (autumn hills) above the hooks
  const pz = 44;
  g.box([0, 29, pz], [0, 36, pz + 7], 'rmGold');
  g.ascii([1, 35, pz + 1], `
    SSSSSS
    SSSOSS
    HHSSSS
    HHHHSS
    QQHHHH
    QQQQQQ`, { S: 'rmCanvasSky', O: 'rmPumpkin', H: 'rmCanvasHill', Q: 'rmCanvasHill2' }, { plane: 'zy' });
}

function fairyLights(g) {
  // warm string lights swagging along the back wall above the sofa
  const hooks = [2, 12, 22, 32, 42];
  for (let i = 0; i < hooks.length - 1; i++) {
    const a = hooks[i], b = hooks[i + 1];
    for (let x = a; x <= b; x++) {
      const t = (x - a) / (b - a);
      const y = Math.round(38 - Math.sin(t * Math.PI) * 3);
      g.set(x, y, 0, 'rmWire');
      if ((x - a) % 2 === 1) g.set(x, y - 1, 0, (x >> 1) % 2 ? 'rmFairy' : 'rmFairyB');
    }
  }
  for (const x of hooks) g.set(x, 39, 0, 'rmBrass');
}

function frontRight(g) {
  // big potted fiddle-leaf fig in the front-right corner
  const pc = [60, 1, 41];
  g.cylinder(pc, 2.4, 4, 'rmPotCream', { r2: 2.1 });
  g.cylinder([pc[0], 4, pc[2]], 1.8, 1, 'rmSoil');
  foliageBlob(g, [[pc[0] + 0.5, 8, pc[2] + 0.5, 3.4], [pc[0] - 1.5, 7, pc[2] + 1.5, 2.4], [pc[0] + 2, 6.5, pc[2] - 1, 2.2]], 61);
  // macramé hanging planter left of the window (above everyone's heads)
  const hp = [47, 30, 4];
  for (let y = hp[1] + 4; y <= 40; y++) g.set(hp[0], y, hp[2], 'rmKnitB');
  g.set(hp[0] - 1, hp[1] + 4, hp[2], 'rmKnitB'); g.set(hp[0] + 1, hp[1] + 4, hp[2], 'rmKnitB');
  g.box([hp[0] - 1, hp[1], hp[2] - 1], [hp[0] + 1, hp[1] + 2, hp[2] + 1], 'rmPot');
  g.box([hp[0] - 1, hp[1] + 3, hp[2] - 1], [hp[0] + 1, hp[1] + 3, hp[2] + 1], 'rmKnitB');
  foliageBlob(g, [[hp[0] + 0.5, hp[1] + 4.5, hp[2] + 0.5, 2.2]], 63);
  for (const [dx, dz, len] of [[-1, 1, 9], [1, 1, 6], [1, -1, 11], [-1, -1, 5], [0, 2, 7]]) for (let i = 0; i < len; i++) g.set(hp[0] + dx + (i % 5 === 4 ? Math.sign(dx) : 0), hp[1] + 1 - i, hp[2] + dz, i % 3 ? 'rmPlant' : 'rmPlantLt', 'keep');
  // yarn basket by the pouf
  g.cylinder([56, 1, 38], 2.6, 4, 'rmBasket');
  g.cylinder([56, 2, 38], 1.6, 3, 0);
  g.sphere([55, 4, 37], 1.3, 'rmYarnRed'); g.sphere([57, 4, 38.5], 1.2, 'rmYarnBlue'); g.sphere([56, 4.5, 39.5], 1.1, 'rmYarnMust');
  g.line([55, 6, 37], [53, 9, 35], 'rmWoodDk'); g.line([56, 6, 37], [55, 9, 34], 'rmWoodDk');
  // a stray yarn ball (cat toy) with a trailing thread
  g.sphere([50, 1.5, 47], 1.1, 'rmYarnRed');
  g.line([51, 1, 47], [54, 1, 49], 'rmYarnRed');
  // stack of books on the floor + a mug on top
  g.box([56, 1, 15], [59, 1, 18], 'rmBook3'); g.box([56, 2, 15], [58, 2, 18], 'rmBook1'); g.box([57, 3, 15], [59, 3, 17], 'rmBook2');
  g.box([57, 4, 16], [58, 5, 16], 'rmMugA'); g.set(57, 5, 16, 'rmCoffee');
  // dog bowl (water) + kibble
  g.cylinder([34, 1, 48], 2.2, 2, 'rmBowl');
  g.cylinder([34, 2, 48], 1.4, 1, 'rmKibble');
  for (let a = 0; a < 16; a++) { const x = Math.round(34 + Math.cos(a / 16 * Math.PI * 2) * 2.2), z = Math.round(48 + Math.sin(a / 16 * Math.PI * 2) * 2.2); g.set(x, 2, z, 'rmBowlRim'); }
  // a chew bone near the dog
  g.box([32, 1, 27], [34, 1, 27], 'rmBone'); g.set(31, 1, 26, 'rmBone'); g.set(31, 1, 28, 'rmBone'); g.set(35, 1, 26, 'rmBone'); g.set(35, 1, 28, 'rmBone');
  // pumpkins by the open front corner
  pumpkin(g, [60, 1, 49], 2.2);
  pumpkin(g, [56, 1, 50], 1.4, 'rmGourdW');
}

function wallClock(g, P) {
  // pendulum wall clock on the left wall between fireplace and window
  const z = 29, x = 0, o = 3;
  g.box([x, 15 + o, z - 2], [x, 27 + o, z + 2], 'rmMantel');       // case (back)
  g.box([x + 1, 22 + o, z - 2], [x + 1, 27 + o, z + 2], 'rmMantel');
  g.box([x + 1, 15 + o, z - 2], [x + 1, 21 + o, z - 2], 'rmMantel'); g.box([x + 1, 15 + o, z + 2], [x + 1, 21 + o, z + 2], 'rmMantel');
  g.box([x + 1, 15 + o, z - 2], [x + 1, 15 + o, z + 2], 'rmMantel');
  g.box([x + 1, 28 + o, z - 1], [x + 1, 28 + o, z + 1], 'rmMantel');
  for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dy) + Math.abs(dz) < 4) g.set(x + 2, 25 + o + dy, z + dz, Math.abs(dy) === 2 || Math.abs(dz) === 2 ? 'rmBrass' : 'rmClockFace');
  g.set(x + 3, 25 + o, z, 'rmClockHand'); g.set(x + 3, 26 + o, z, 'rmClockHand'); g.set(x + 3, 25 + o, z + 1, 'rmClockHand');
  const pend = new VoxelGrid(P);
  pend.box([x + 1, 17 + o, z], [x + 1, 21 + o, z], 'rmBrass');
  pend.box([x + 1, 16 + o, z - 1], [x + 1, 17 + o, z + 1], 'rmGold');
  return { part: { name: 'pendulum', grid: pend, pivot: [x + 1.5, 22 + o, z + 0.5] } };
}
