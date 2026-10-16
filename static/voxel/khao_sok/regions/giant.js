// The giant — the heart of Khao Sok: a colossal emergent dipterocarp with gigantic buttress roots standing in a
// clearing, a tree-house platform high on its bole and a rope-bridge canopy walkway to a strangler fig; gibbons,
// a hornbill pair at their mud-sealed nest, a sun bear climbing toward a wild bees' comb, a Saraca 'sok' tree in
// bloom, rainforest all around, and a little beach landing on the lake shore (east) where the trail starts.
import { ground } from '../base.js';
import { LIFE, groundY, columnAt, isLake, LAKE_Y } from '../layout.js';
import {
  strangler, jungleTree, rainforest, bamboo, banana, treeFern, heliconia,
  undergrowth, epiphytes, lianas, fallenLog, treeHouse, ropeBridge, walkway, kayak, person, hash3, clamp, rng,
} from '../../lib/index.js';
import { paleBark, buttresses, surfaceAt, trunkCentre, sunBear, beeComb, hornbillNest, ringDeck } from './giant-parts.js';
import { giantTree } from './giant-tree.js';

// ---- the plan (world coords; the camera looks from +x/+z) ----------------------------------------------------
// (the giant's bole stands just right of the falls' waterfall on screen, so the lower cascades show beside it)
const G = [0, -10];           // the giant dipterocarp
const NF = [24, -30];         // the strangler fig at the far end of the canopy walkway (screen-right of the giant)
const B = [24, -14];          // the bees' tree the sun bear climbs (right edge of the clearing, by the shore)
const F = [30, 15];           // a Saraca 'sok' tree in bloom by the shore (flowers on its trunk and limbs: the colour accent)
const DECK = [9, 16];         // viewing deck at the giant's foot
const LZ = -5;                // the landing: the rafts' floating boardwalk arrives at x = 40, z = −6…−4 (deck y = 1)
const TRAIL = [[33, LZ], [27, LZ + 1], [21, 4], [17, 11], [14, 18]];
const NW = (x, z) => x < -22 && z < -22;   // keep low: the falls' plunge pool + lower cascades are seen over it
const VIEW = [0.342, 0.94];   // horizontal direction toward the default camera (yaw 20)
const SIDE = [0.94, -0.342];  // screen-right

const BARKS = ['barkPale', 'barkPaleDark', 'barkPaleLight', 'jungleBarkMoss', 'giant_mossBright'];

function locals(P) {
  const add = (n, d) => P.add('giant_' + n, d);
  // ground tags: same look as the shared floor materials (the rainforest only grows on the shared ones)
  add('floor', { colors: ['#4c6a2a', '#56702e', '#46622a'], jitter: 0.05, noise: { color: '#3e5a26', scale: 0.12, amount: 0.5 } });
  add('floorLitter', { colors: ['#6e5e34', '#77663a', '#64552f'], jitter: 0.06 });
  add('floorMoss', { colors: ['#3f6a2c', '#4a7630', '#386226'], jitter: 0.05 });
  add('litter', { colors: ['#7a6438', '#836c3e', '#6c5a33', '#8a5a34'], jitter: 0.06 });       // clearing: dry leaves
  add('trail', { colors: ['#9a6a46', '#8e6040', '#a4744e'], jitter: 0.05 });                   // packed red earth path
  add('mossBright', { color: '#6a8a34', jitter: 0.07 });
  add('mud', { colors: ['#86745a', '#7a684e', '#927e62'], jitter: 0.08, noise: { color: '#5e5040', scale: 0.6, amount: 0.7 } });
  add('mudDark', { color: '#5a4a38', jitter: 0.06 });
  add('nestDark', { color: '#1a120c', jitter: 0.02 });
  add('billTip', { color: '#f4c23a', jitter: 0.03 });
  add('billRed', { color: '#e0702a', jitter: 0.03 });
  add('bearFur', { color: '#1f1d21', jitter: 0.04, roughness: 0.6 });
  add('bearFur2', { color: '#2c292d', jitter: 0.04 });
  add('bearMuzzle', { color: '#c49a68', jitter: 0.04 });
  add('bearChest', { color: '#eaa53a', jitter: 0.04 });
  add('bearNose', { color: '#0e0d0f', jitter: 0 });
  add('claw', { color: '#cfc4aa', jitter: 0.02 });
  add('bees', { colors: ['#3a2a14', '#4a3418', '#2e2210'], jitter: 0.06 });
  add('beesGold', { colors: ['#b08024', '#c8962c'], jitter: 0.05 });
  add('comb', { color: '#e8b040', jitter: 0.05, roughness: 0.4 });
  add('leafGold', { color: '#b0c858', jitter: 0.05, sway: 0.35 });                              // the giant's sunlit crown top
  add('combDark', { color: '#a87018', jitter: 0.05 });
  add('stub', { color: '#8e8370', jitter: 0.05 });                                             // the hornbill's perch
  add('tongue', { color: '#e07888', jitter: 0.03 });
  add('lens', { color: '#e8e6e0', jitter: 0.02, roughness: 0.4 });
  add('lensHood', { color: '#151515', jitter: 0.02 });
  add('net', { colors: ['#4a5a2c', '#3e4e26', '#566830'], jitter: 0.06 });                     // camouflage netting
  add('netBrown', { colors: ['#6a5634', '#5a4a2c'], jitter: 0.06 });
  add('khaki', { color: '#b8a878', jitter: 0.04 });
}

export default function build(g, ctx) {
  const OFF = new Set(ctx.options?.off ?? []);               // dev: skip parts to measure their cost (tools)
  ground(g, ctx);
  locals(ctx.P);
  ctx.clip = true;
  const [[x0, , z0], [x1, , z1]] = ctx.box;
  const R = rng(ctx.seed);
  const N = ctx.noise;
  const top = (x, z) => groundY(x, z);                        // land top y (null in the lake)
  const stand = (x, z) => (groundY(x, z) ?? LAKE_Y) + 1;

  // ---- zones: the clearing at the giant's foot + a band of low growth toward the camera so the buttresses read ----
  const rel = (x, z) => { const dx = x - G[0], dz = z - G[1]; return { d: dx * VIEW[0] + dz * VIEW[1], s: dx * SIDE[0] + dz * SIDE[1], r: Math.hypot(dx, dz) }; };
  const trailDist = (x, z) => {
    let best = Infinity;
    for (let i = 1; i < TRAIL.length; i++) {
      const [ax, az] = TRAIL[i - 1], [bx, bz] = TRAIL[i], vx = bx - ax, vz = bz - az;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz));
      best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
    }
    return best;
  };
  const wob = (x, z) => N.simplex2(x * 0.09, z * 0.09) * 2.5;
  // the clearing: a disc round the foot + a wide sunlit glade toward the camera (the whole buttress spread stays visible)
  const clearing = (x, z) => {
    const { d, s, r } = rel(x, z), w = wob(x, z);
    return r < (d > -4 ? 21 : 14) + w || (d > 0 && d < 36 + w && s > -22 - w + Math.max(0, d - 22) * 0.6 && s < (d < 24 ? 31 : 24) + w - Math.max(0, d - 22) * 0.6);
  };
  const low = (x, z) => {
    const { d, s } = rel(x, z), w = wob(x, z);
    if (clearing(x, z)) return true;
    if (d > 0 && Math.abs(s - 1) < 16 + w) return true;                     // low growth beyond the glade, toward the shore
    if (x > 27 + w && Math.abs(z - LZ) < 12) return true;                        // the beach landing
    if (NW(x - w, z - w)) return true;
    return trailDist(x, z) < 3.5;
  };
  // vegetation height cap in the low zone (relative to the ground) so the camera sees over it to the buttresses:
  // low in the middle of the band, rising toward its edges and with distance
  const cap = (x, z) => { const { d, s } = rel(x, z); if (clearing(x, z)) return 2; if (NW(x, z)) return 9; return clamp(0.55 * (d - 30) + Math.max(0, Math.abs(s - 1) - 9) * 0.8, 0, 22); };

  // ---- paint the ground: tags for the low zone, leaf litter in the clearing, the trail -----------------------
  const SH = { floor: g.mat('floor'), floorMoss: g.mat('floorMoss'), floorLitter: g.mat('floorLitter') };
  const TAG = { [SH.floor]: g.mat('giant_floor'), [SH.floorMoss]: g.mat('giant_floorMoss'), [SH.floorLitter]: g.mat('giant_floorLitter') };
  const litter = g.mat('giant_litter'), trailM = g.mat('giant_trail'), sand = g.mat('sandJ'), moss = g.mat('giant_floorMoss');
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const c = columnAt(x, z);
    if (c.kind !== 'land') continue;
    const y = c.top, id = g.get(x, y, z);
    const td = trailDist(x, z);
    if (td < 1.6 + N.simplex2(x * 0.3, z * 0.3) * 0.5 && x < 33) { g.set(x, y, z, trailM); continue; }
    if (x >= 27 && Math.abs(z - LZ) <= 9 + N.simplex2(x * 0.2, 7) * 2 && y <= 2) { g.set(x, y, z, sand); continue; }   // beach
    if (!TAG[id]) continue;
    if (!low(x, z)) continue;
    const { r } = rel(x, z);
    if (r < 15 + wob(x, z)) g.set(x, y, z, N.simplex2(x * 0.12 + 5, z * 0.12) > 0.3 ? moss : litter);
    else g.set(x, y, z, TAG[id]);
  }

  // ---- rainforest everywhere else ---------------------------------------------------------------------------
  const Fby = stand(...F), Nby = stand(...NF);
  if (!OFF.has('forest')) rainforest(g, [x0, z0], [x1, z1], {
    on: ['floor', 'floorMoss', 'floorLitter'], border: false, height: [16, 25], emergents: [], density: 0.56,
    flowering: 0, gaps: 0.25, edge: 0, seed: R.int(0, 1e6),
    avoid: [[[NF[0] - 7, NF[1] - 7], [NF[0] + 7, NF[1] + 7]]],
  });
  // fill the holes the canopy left (esp. along the seams, where the neighbours' forest continues)
  const bare = (x, z) => { const c = columnAt(x, z); return c.kind === 'land' && g.top(x, z) === c.top && !!SH[Object.keys(SH).find((k) => SH[k] === g.get(x, c.top, z))]; };
  if (!OFF.has('forest')) for (let gz = z0 + 2; gz <= z1 - 1; gz += 6) for (let gx = x0 + 2; gx <= x1 - 1; gx += 6) {
    const x = gx + R.int(-2, 2), z = gz + R.int(-2, 2), seed = R.int(0, 1e6);
    if (Math.hypot(x - NF[0], z - NF[1]) < 9 || Math.min(x - x0, x1 - x, z - z0, z1 - z) > 9) continue;   // seams only
    let ok = true;
    for (let dz = -3; dz <= 3 && ok; dz += 3) for (let dx = -3; dx <= 3 && ok; dx += 3) ok = bare(clamp(x + dx, x0, x1), clamp(z + dz, z0, z1));
    if (!ok) continue;
    const h = 14 + (seed % 8);
    jungleTree(g, [x, stand(x, z), z], { height: h, style: 'round', crownRadius: h * 0.34, seed, bias: -0.04 - (seed % 4) * 0.02, trunk: ['barkDark', 'bark'] });
  }

  // ---- the giant ------------------------------------------------------------------------------------------
  const by = stand(...G);
  const giant = giantTree(g, [G[0], by, G[1]], { height: 107, crownRadius: 29, trunkRadius: 6, fork: 74, view: VIEW, seed: 7 });
  const bark = paleBark(g, by + 1, 21);
  // flared foot
  for (let y = by - 2; y <= by + 6; y++) {
    const r = 6 + Math.max(0, by + 5 - y) * 0.45;
    for (let z = Math.floor(G[1] - r); z <= Math.ceil(G[1] + r); z++) for (let x = Math.floor(G[0] - r); x <= Math.ceil(G[0] + r); x++)
      if (Math.hypot(x - G[0], z - G[1]) <= r) g.put(x, y, z, bark(x, y, z));
  }
  const fins = buttresses(g, [G[0], by, G[1]], { r0: 6, n: 6, len: [14, 19], height: [17, 25], bark, seed: 5 });

  // ---- tree-house platform high on the bole ------------------------------------------------------------------
  const deckY = by + 34;
  const [tcx, tcz] = trunkCentre(g, G[0], deckY, G[1], 6, BARKS).map(Math.round);
  const tr = (surfaceAt(g, tcx, deckY, tcz, 1, 0) + surfaceAt(g, tcx, deckY, tcz, -1, 0) + surfaceAt(g, tcx, deckY, tcz, 0, 1) + surfaceAt(g, tcx, deckY, tcz, 0, -1)) / 4;
  const SG = 9;
  treeHouse(g, [tcx, by - 1, tcz], { y: deckY, trunkR: tr + 0.2, size: SG, side: '+z', stair: false, bridges: [], seed: 3 });
  const aG = [tcx + SG - 1, deckY, tcz - SG + 1];
  // a researcher at the rail with the canopy view, a ladder of pegs and rungs up the bole (between two buttresses)
  person(g, [tcx - 2, deckY + 1, tcz + SG - 2], { side: '+z', seed: 21, shirt: 'kayakOrange', hat: 'plankLight' });
  {
    const fa = fins.map((f) => f.a), cand = [];
    for (let a = 2.3; a <= 3.0; a += 0.05) cand.push([a, Math.min(...fa.map((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))))]);
    const la = cand.reduce((A, B2) => (B2[1] > A[1] ? B2 : A))[0], lx = Math.cos(la), lz = Math.sin(la), px = -lz, pz = lx;
    for (let y = by; y < deckY; y++) {
      const c = trunkCentre(g, G[0], Math.min(y + 8, deckY - 1), G[1], 8, BARKS), r = surfaceAt(g, c[0], y, c[1], lx, lz);
      const cx = c[0] + lx * (r + 0.4), cz = c[1] + lz * (r + 0.4);
      for (const sd of [-1, 1]) g.put(Math.round(cx + px * sd * 1.2), y, Math.round(cz + pz * sd * 1.2), 'plankDark');
      if (y % 2 === 0) g.put(Math.round(cx), y, Math.round(cz), 'plank');
    }
    const c = trunkCentre(g, G[0], deckY - 1, G[1], 8, BARKS), r = surfaceAt(g, c[0], deckY - 1, c[1], lx, lz);
    for (let k = 0; k <= 1; k++) for (const sd of [-1, 0, 1]) g.set(Math.round(c[0] + lx * (r + 0.4 + k) + px * sd), deckY, Math.round(c[1] + lz * (r + 0.4 + k) + pz * sd), 0);   // hatch
  }

  // ---- the strangler fig + its observation deck ------------------------------------------------------------
  const fig = strangler(g, [NF[0], Nby, NF[1]], { height: 60, crownRadius: 10, columnRadius: 4, door: true, doorAngle: Math.atan2(VIEW[1], VIEW[0]), aerial: 10, fruitAmount: 0.04, seed: 4 });
  const deckN = deckY - 3, SN = 7;
  const bN = [NF[0] - SN + 1, deckN, NF[1] + SN - 1];
  ringDeck(g, NF, deckN, { S: SN, rIn: 3.9, gaps: [[bN[0], bN[2]]] });

  // ---- the canopy walkway --------------------------------------------------------------------------------
  const clearRail = (p) => {
    for (let y = p[1] + 1; y <= p[1] + 5; y++) for (let z = p[2] - 2; z <= p[2] + 2; z++) for (let x = p[0] - 2; x <= p[0] + 2; x++) {
      const id = g.get(x, y, z);
      if (id && Math.hypot(x - p[0], z - p[2]) < 1.8 && ['beam', 'bambooPole', 'bambooPoleDark', 'fiberRope'].some((m) => g.mat(m) === id)) g.set(x, y, z, 0);
    }
  };
  clearRail(aG); clearRail(bN);
  const sag = 2;
  ropeBridge(g, aG, bN, { width: 3, sag, railH: 3, every: 3, seed: 2 });
  const bridgeAt = (t, lat = 0) => {
    const dx = bN[0] - aG[0], dz = bN[2] - aG[2], len = Math.hypot(dx, dz);
    return [aG[0] + 0.5 + dx * t - (dz / len) * lat, Math.round(aG[1] + (bN[1] - aG[1]) * t - sag * 4 * t * (1 - t)) + 1, aG[2] + 0.5 + dz * t + (dx / len) * lat];
  };

  // ---- hornbill nest in the giant's bole (camera side, right) ----------------------------------------------
  const nestY = by + 17;
  const nc = trunkCentre(g, G[0], nestY + 3, G[1], 7, BARKS);
  const nd = [0.73, 0.68];
  const nest = hornbillNest(g, nc, nestY, nd);

  // ---- the bees' tree + the climbing sun bear ------------------------------------------------------------
  const Bby = stand(...B);
  jungleTree(g, [B[0], Bby, B[1]], { height: 28, style: 'round', crownRadius: 7.5, crownDepth: 0.36, trunk: ['barkPaleDark', 'barkPale', 'barkPaleLight'], trunkRadius: 2.1, seed: 12 });
  const bd = [-0.5, 0.866];                                      // bear on the trunk side facing the bear stop's camera (yaw −30)
  const bs = surfaceAt(g, B[0], Bby + 5, B[1], bd[0], bd[1]);
  sunBear(g, [B[0] + 0.5 + bd[0] * (bs - 0.6), Bby + 5, B[1] + 0.5 + bd[1] * (bs - 0.6)], bd, 1, { look: 1, tongue: true });
  // a bough out to the right of him (seen from that stop) with the giant honey bee comb under it: he looks up at it
  const cbY = Bby + 16, cbd = [0.866, 0.5];
  g.line([B[0], cbY - 2, B[1]], [B[0] + cbd[0] * 9, cbY + 1, B[1] + cbd[1] * 9], 'barkPale', { r: 0.8, r2: 0.55 });
  beeComb(g, [B[0] + cbd[0] * 5.5, cbY - 1, B[1] + cbd[1] * 5.5], [cbd[0], cbd[1]], { drips: 2 });

  // ---- the gag: a wildlife photographer in a camouflage hide, a huge white telephoto lens aimed up at the hornbill
  // nest — oblivious to the sun bear climbing the tree right behind him ------------------------------------------
  {
    const cam = [-0.5, 0.866], perp = [0.866, 0.5];          // toward the bear stop's camera (yaw −30), and across it
    const freeAt = (x, z) => {
      for (let zz = z - 2; zz <= z + 2; zz++) for (let xx = x - 2; xx <= x + 3; xx++) {
        const gy = top(xx, zz);
        if (gy == null || trailDist(xx, zz) < 2.5) return false;
        for (let y = gy + 1; y <= gy + 7; y++) if (g.get(xx, y, zz)) return false;
      }
      return true;
    };
    let P = null;
    for (const t of [6, 7, 5, 8, 9]) for (const lat of [2, 4, 0, 6, -2]) {
      if (P) break;
      const x = Math.round(B[0] + cam[0] * t + perp[0] * lat), z = Math.round(B[1] + cam[1] * t + perp[1] * lat);
      if (freeAt(x, z)) P = [x, z];
    }
    if (P) {
      const [px, pz] = P, py = stand(px, pz);
      const net = (x, y, z) => (hash3(x, y, z, 31) < 0.28 ? 0 : hash3(x, y, z, 32) < 0.35 ? 'giant_netBrown' : 'giant_net');
      for (const [x, z] of [[px - 2, pz - 2], [px + 3, pz - 2], [px - 2, pz + 2], [px + 3, pz + 2]]) g.box([x, py, z], [x, py + 5, z], 'bambooPoleDark');
      for (let y = py; y <= py + 5; y++) {
        for (let z = pz - 1; z <= pz + 1; z++) { const m = net(px + 3, y, z); if (m) g.put(px + 3, y, z, m); }     // back wall
        for (let x = px - 1; x <= px + 2; x++) { const m = net(x, y, pz - 2); if (m) g.put(x, y, pz - 2, m); }     // side wall
      }
      for (let x = px; x <= px + 3; x++) for (let z = pz - 2; z <= pz + 2; z++) { const m = net(x, py + 6, z); if (m || (x + z) & 1) g.put(x, py + 6, z, m || 'giant_net'); }   // roof
      person(g, [px, py, pz - 1], { side: '-x', seed: 41, shirt: 'giant_khaki', pants: 'giant_netBrown', hat: 'giant_khaki' });
      // the lens: from in front of his face up toward the nest slit
      const T = [nest.slit[0] + 0.5, nest.slit[2] + 0.5, nest.slit[1] + 0.5], C = [px - 0.5, py + 5.5, pz + 0.5];
      const D = [T[0] - C[0], T[1] - C[1], T[2] - C[2]], dl = Math.hypot(...D);
      for (let i = 0; i <= 5; i++) {
        const q = C.map((v, k) => Math.floor(v + (D[k] / dl) * i * 0.85));
        g.put(q[0], q[1], q[2], i === 5 ? 'giant_lensHood' : 'giant_lens');
      }
      g.box([px + 1, py, pz + 1], [px + 1, py + 1, pz + 1], 'metalDark');   // a camera bag on the ground
    }
  }

  // ---- Saraca 'sok' (the tree Khao Sok is named for) in bloom: small, dark crown, orange flower clusters right
  // on the trunk and limbs (cauliflory) ---------------------------------------------------------------------------
  {
    const sk = jungleTree(g, [F[0], Fby, F[1]], { height: 14, style: 'round', crownRadius: 6, flowers: 'flameFlower', flowerAmount: 0.3, bias: -0.06, trunk: ['barkDark', 'bark'], trunkRadius: 0.9, seed: 9 });
    const fl = ['flameFlower', 'flameFlowerLight'];
    for (const [ox, oz, h] of [[1, 0, 3], [-0.7, 0.7, 5], [0, 1, 7], [0.7, -0.7, 4], [0.7, 0.7, 8], [-1, 0, 6]]) {   // on the trunk
      const y = Fby + h, r = surfaceAt(g, F[0], y, F[1], ox, oz, 4);
      const x = Math.round(F[0] + ox * (r + 0.3)), z = Math.round(F[1] + oz * (r + 0.3));
      g.put(x, y, z, fl[h & 1], 'keep'); g.put(x, y - 1, z, fl[(h + 1) & 1], 'keep');
    }
    for (const [x, y, z] of sk.limbs.slice(0, 4)) { g.put(x, y - 1, z, fl[0], 'keep'); g.put(x + 1, y - 1, z, fl[1], 'keep'); }
  }

  // ---- viewing deck at the giant's foot ---------------------------------------------------------------------
  const dy = Math.max(top(DECK[0], DECK[1]), top(DECK[0] - 3, DECK[1] - 2), top(DECK[0] + 3, DECK[1] + 2)) + 2;
  const dx0 = DECK[0] - 3, dx1 = DECK[0] + 3, dz0 = DECK[1] - 2, dz1 = DECK[1] + 2;
  for (let x = dx0; x <= dx1; x++) for (let z = dz0; z <= dz1; z++) {
    g.put(x, dy, z, hash3(x, 1, z, 3) < 0.15 ? 'plankLight' : (x & 1) ? 'plank' : 'plankDark');
    const corner = (x === dx0 || x === dx1) && (z === dz0 || z === dz1);
    if (corner) for (let y = (top(x, z) ?? dy - 3) + 1; y < dy; y++) g.put(x, y, z, 'beam');
    const edge = x === dx0 || z === dz0 || (z === dz1 && x < dx1 - 2) || (x === dx1 && z < dz1 - 2);
    if (edge) { if (corner || (x + z) % 3 === 0) g.box([x, dy + 1, z], [x, dy + 2, z], 'beam'); else g.put(x, dy + 2, z, 'plankDark'); }
  }
  for (let s = 1; s <= 2; s++) g.box([dx1 - 2 + s, dy - s, dz1 + s], [dx1 + s - 1, dy - s, dz1 + s], 'plankDark');   // steps down to the trail
  person(g, [DECK[0] - 1, dy + 1, DECK[1] - 1], { side: '-z', pose: 'wave', seed: 11, hat: 'giant_trail' });
  person(g, [DECK[0] + 1, dy + 1, DECK[1]], { side: '-x', seed: 5 });
  // a mossy nurse log in the glade, a family resting on it
  fallenLog(g, [-6, stand(-6, 22), 22], [4, stand(4, 26), 26], { radius: 2, hollow: true, fungi: 4, ferns: 1, seed: 6 });

  // ---- the landing on the lake shore ------------------------------------------------------------------------
  walkway(g, [[39, LZ], [32, LZ]], { y: LAKE_Y + 1, width: 3, rail: true, seed: 9 });          // continues the rafts' landing
  kayak(g, [29, 1, LZ + 7], { dir: '-x', people: 0, color: 'kayakOrange', seed: 3 });
  kayak(g, [31, 1, LZ - 6], { dir: '+z', people: 0, color: 'kayakYellow', seed: 4 });

  // ---- low growth: bananas, tree ferns, heliconias, bamboo and young trees, capped so the view stays open ------
  const placed = [];
  const free = (x, z, r) => placed.every(([px, pz, pr]) => Math.hypot(x - px, z - pz) > r + pr);
  if (!OFF.has('low')) for (let gz = z0 + 3; gz <= z1 - 3; gz += 5) for (let gx = x0 + 3; gx <= x1 - 3; gx += 5) {
    const x = gx + R.int(-2, 2), z = gz + R.int(-2, 2);
    if (!low(x, z) || clearing(x, z) || trailDist(x, z) < 4 || isLake(x, z)) continue;
    if (x > 24 && Math.abs(z - LZ) < 12) continue;                                  // keep the landing open
    if (Math.hypot(x - B[0], z - B[1]) < 7 || Math.hypot(x - DECK[0], z - DECK[1]) < 6) continue;
    const c = cap(x, z), y = stand(x, z), k = R();
    if (top(x, z) <= 2) continue;
    if (NW(x, z) && k < 0.35 && free(x, z, 4)) { jungleTree(g, [x, y, z], { height: R.int(8, 10), style: 'round', crownRadius: 3.6, roots: false, seed: R.int(0, 1e6), bias: -0.04 }); placed.push([x, z, 4]); }
    else if (c >= 15 && k < 0.45 && free(x, z, 6)) { jungleTree(g, [x, y, z], { height: Math.round(c * R.range(0.8, 1)), style: R.pick(['round', 'round', 'tall']), seed: R.int(0, 1e6), bias: -0.03 }); placed.push([x, z, 5]); }
    else if (c >= 13 && k < 0.7 && free(x, z, 4)) { bamboo(g, [x, y, z], { height: Math.round(Math.min(c, 18)), culms: R.int(8, 12), seed: R.int(0, 1e6) }); placed.push([x, z, 4]); }
    else if (c >= 6 && k < 0.6 && free(x, z, 3)) { banana(g, [x, y, z], { seed: R.int(0, 1e6) }); placed.push([x, z, 3]); }
    else if (c >= 6 && free(x, z, 3)) { treeFern(g, [x, y, z], { height: R.int(5, Math.min(9, Math.round(c))), seed: R.int(0, 1e6) }); placed.push([x, z, 3]); }
    else if (c >= 3 && k < 0.3 && free(x, z, 2)) { heliconia(g, [x, y, z], { height: 4.5, seed: R.int(0, 1e6) }); placed.push([x, z, 2]); }
  }
  // undergrowth: sparse small ferns in the glade, lusher beyond it (not on the trail, the deck, the landing)
  const tags = ['giant_floor', 'giant_floorMoss', 'giant_floorLitter', 'giant_litter'];
  const busy = (x, z) => trailDist(x, z) < 2.6 || (x >= dx0 - 1 && x <= dx1 + 3 && z >= dz0 - 1 && z <= dz1 + 3) || (x > 26 && Math.abs(z - LZ) < 10);
  if (!OFF.has('under')) undergrowth(g, [x0, z0], [x1, z1], {
    on: tags, density: 0.45, scale: 0.8, seed: 31, avoid: (x, z) => busy(x, z) || !clearing(x, z) || rel(x, z).r < 17,
    mix: { fern: 6, alocasia: 0.4, heliconia: 0, seedling: 1, tuft: 5, flower: 0.25, mushroom: 0.5, treeFern: 0 },
  });
  if (!OFF.has('under')) undergrowth(g, [x0, z0], [x1, z1], {
    on: tags, density: 0.7, seed: 32, avoid: (x, z) => busy(x, z) || clearing(x, z),
    mix: { fern: 6, alocasia: 1.5, heliconia: 0.1, seedling: 1, tuft: 4, flower: 0.15, mushroom: 0.3, treeFern: 0.3 },
  });

  // the ground tags were only for the generators' `on` filters: back to the shared materials (merges into bigger faces)
  for (const [k, id] of Object.entries(TAG)) g.replace(id, Number(k), [x0, -2, z0], [x1, 16, z1]);

  // ---- epiphytes, orchids and lianas ----------------------------------------------------------------------
  if (!OFF.has('epi')) epiphytes(g, { area: [[G[0] - 9, by + 6, G[1] - 9], [G[0] + 9, by + 52, G[1] + 9]], on: ['barkPale', 'barkPaleDark', 'barkPaleLight'], density: 0.035, mix: { moss: 5, bromeliad: 0.6, orchid: 1, fern: 3 }, seed: 4 });
  // (the limbs under the crown: too high to see, skip) — and keep the hornbill's nest clear of epiphytes
  {
    const kill = new Set(['orchid', 'orchidWhite', 'bromeliad', 'bromeliadLeaf', 'fern', 'fernDark', 'fernLight'].map((m) => g.mat(m)));
    const [sx, sz] = nest.slit;                                          // [x, z, y]
    for (let y = nestY - 4; y <= nestY + 9; y++) for (let z = sz - 5; z <= sz + 5; z++) for (let x = sx - 5; x <= sx + 5; x++)
      if (kill.has(g.get(x, y, z))) g.set(x, y, z, 0);
  }
  if (!OFF.has('epi')) epiphytes(g, { area: [[NF[0] - 16, Nby + 10, NF[1] - 16], [NF[0] + 16, Nby + 60, NF[1] + 16]], on: ['figRoot', 'figRootDark'], density: 0.05, seed: 5 });
  if (!OFF.has('lianas')) lianas(g, giant.limbs.filter((_, i) => i % 4 === 1), { chance: 0.8, connect: 0.15, dangle: 0.5, drift: 6, twist: 1.6, seed: 6 });

  // ---- gibbons: a big liana swagged from the giant's bole above the deck across to the fig's crown, over the walkway;
  // gibbons brachiate back and forth along it (their hand-hold line is the vine's underside) -------------------------
  const vd = [bN[0] - aG[0], bN[2] - aG[2]], vl = Math.hypot(...vd), vu = [vd[0] / vl, vd[1] / vl];
  const vs = surfaceAt(g, tcx, deckY + 21, tcz, vu[0], vu[1]);
  const vA = [tcx + vu[0] * (vs - 0.5) - VIEW[0] * 2, deckY + 21, tcz + vu[1] * (vs - 0.5) - VIEW[1] * 2];
  const vB = [NF[0] - vu[0] * 6 - VIEW[0] * 2, fig.crownY + 5, NF[1] - vu[1] * 6 - VIEW[1] * 2];
  const vSag = 3, vAt = (t) => [vA[0] + (vB[0] - vA[0]) * t, Math.round(vA[1] + (vB[1] - vA[1]) * t - vSag * 4 * t * (1 - t)), vA[2] + (vB[2] - vA[2]) * t];
  const vine = [];
  for (let i = 0; i <= 24; i++) vine.push(vAt(i / 24));
  for (let i = 1; i < vine.length; i++) g.line(vine[i - 1], vine[i], (x, y, z) => (hash3(x, y, z, 2) < 0.25 ? 'lianaDark' : 'liana'), { mode: 'keep' });
  for (let i = 2; i < vine.length - 2; i += 3) {                // leafy tufts + a few hanging tendrils
    const [x, y, z] = vine[i].map(Math.round), L = 1 + Math.floor(hash3(x, y, z, 8) * 4);
    for (let k = 1; k <= L; k++) g.put(x, y - k, z, k === L ? 'lianaLeaf' : 'liana', 'keep');
    g.put(x + 1, y + 1, z, 'lianaLeaf', 'keep'); g.put(x, y + 1, z - 1, 'lianaLeaf', 'keep');
  }
  const swing = [];
  for (let i = 1; i <= 23; i++) swing.push([vine[i][0] + 0.5, vine[i][1], vine[i][2] + 0.5]);
  for (let i = 23; i >= 1; i--) swing.push([vine[i][0] + 0.8, vine[i][1], vine[i][2] + 0.2]);
  ctx.emit('actors', { creature: 'gibbon', count: 3, variants: 2, options: [{ coat: 'buff' }, { coat: 'black' }], behavior: 'path', path: swing, seed: 4 });
    // a habituated one sits on the tree-house rail beside the researcher, long arms dangling
  let rail = deckY + 1; while (g.get(tcx - 4, rail, tcz + SG) && rail < deckY + 5) rail++;
  ctx.emit('actors', { creature: 'gibbon', options: { coat: 'black', pose: 'sit' }, behavior: 'still', spots: [[tcx - 4 + 0.5, rail, tcz + SG + 0.5, 15]], seed: 6 });
  // …from the fig crown's underside over the front of its deck (a stub of branch to hold)
  const fl = [Math.round(NF[0] + VIEW[0] * 6 + SIDE[0] * 2), 0, Math.round(NF[1] + VIEW[1] * 6 + SIDE[1] * 2)];
  let hang = fig.crownY - 4; while (!g.get(fl[0], hang, fl[2]) && hang < fig.crownY + 10) hang++;
  g.put(fl[0], hang - 1, fl[2], 'figRoot'); g.put(fl[0] + 1, hang - 1, fl[2], 'figRoot', 'keep');
  ctx.emit('actors', { creature: 'gibbon', options: { coat: 'buff' }, behavior: 'still', spots: [[fl[0] + 0.5, hang - 1, fl[2] + 0.5, 220]], seed: 7 });

  // ---- life ------------------------------------------------------------------------------------------------
  // the male great hornbill at the nest slit, passing a fig to the sealed-in female
  ctx.emit('actors', { creature: 'hornbill', behavior: 'still', options: { eye: '#d8402a' }, spots: [nest.perch], seed: 3 });
  // visitors: walking the trail from the landing to the viewing deck, crossing the canopy walkway
  // (3D points: the trail runs under the giant's crown, and 2D paths would snap to the top surface)
  const along = (pts, off) => {
    const res = [];
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) { const x = ax + (bx - ax) * (k / n) + off[0], z = az + (bz - az) * (k / n) + off[1]; res.push([x, stand(Math.floor(x), Math.floor(z)), z]); }
    }
    return res;
  };
  const out = along(TRAIL, [0.5, -0.3]), back = along(TRAIL.slice().reverse(), [-0.2, 1.2]);
  ctx.emit('actors', { ...LIFE.walker, count: 4, behavior: 'path', path: [...out, ...back] });
  const bp = [];
  for (let i = 0; i <= 8; i++) bp.push(bridgeAt(i / 8, -0.5));
  for (let i = 8; i >= 0; i--) bp.push(bridgeAt(i / 8, 0.6));
  ctx.emit('actors', { ...LIFE.walker, count: 2, behavior: 'path', path: bp });
  // (fliers wander at an altitude above the top surface: keep their areas out from under the giant's crown, z ≥ 25)
  ctx.emit('actors', { ...LIFE.birdwing, count: 3, area: [[F[0] - 12, 25], [F[0] + 4, 36]] });
  ctx.emit('actors', { ...LIFE.butterfly, count: 6, area: [[-2, 25], [DECK[0] + 12, 36]] });

  // atmosphere: golden dust motes in the clearing, a few leaves drifting down from the crown, bees round the comb
  // morning ground mist lying low in the glade and under the forest round the giant's foot
  ctx.emit('particles', { preset: 'mist', motion: 'drift', count: 30, size: 10, sizeJitter: 0.4, opacity: 0.13, glow: 1, colors: ['#ffffff', '#f6efe4'], speed: 0.03, turbulence: 0.25, box: [[-20, by + 2, z0 + 4], [B[0] - 6, by + 4, G[1] + 26]] });
  ctx.emit('particles', { preset: 'dust', count: 90, box: [[G[0] - 4, by, G[1] + 2], [G[0] + 22, by + 26, G[1] + 26]] });
  ctx.emit('particles', { preset: 'leaves', count: 24, colors: ['#78a83a', '#c8a040', '#4a8a34'], box: [[G[0] - 18, by + 4, G[1] - 18], [G[0] + 18, by + 70, G[1] + 18]] });
  const cb = [B[0] + cbd[0] * 5.5, cbY - 3, B[1] + cbd[1] * 5.5];
  ctx.emit('particles', { preset: 'cubes', count: 26, colors: ['#2a2010', '#c8962c'], size: 0.22, sizeJitter: 0.3, speed: 1.4, turbulence: 2, glow: 0, box: [[cb[0] - 3, cb[1] - 3, cb[2] - 3], [cb[0] + 3, cb[1] + 4, cb[2] + 3]] });

  // ---- points of interest ------------------------------------------------------------------------------------
  ctx.emit('poi', { label: 'The giant dipterocarp', icon: '🌳', target: [G[0], by + 52, G[1]], zoom: 2.2 });
  ctx.emit('poi', { label: 'Canopy walkway & gibbons', icon: '🐒', target: [bridgeAt(0.5)[0], bridgeAt(0.5)[1] + 6, bridgeAt(0.5)[2]], zoom: 5 });
  ctx.emit('poi', { label: 'Hornbill nest', icon: '🪶', target: [(nest.slit[0] + nest.perch[0]) / 2, (nest.slit[2] + nest.perch[1]) / 2 + 3, (nest.slit[1] + nest.perch[2]) / 2], zoom: 6.5 });
  ctx.emit('poi', { label: 'Sun bear raiding the honeycomb', icon: '🐻', target: [B[0] - 1, Bby + 11, B[1] + 3], zoom: 9, yaw: -30 });
}
