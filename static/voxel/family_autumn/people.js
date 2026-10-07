// The two of us on the sofa: him (screen-left, nearer the fire) with a little book open in his lap, her
// (screen-right) cradling a mug in sweater-paw hands, her head leaning toward him.
//
// Chibi proportions: big heads on slim 7-wide bodies. Everything is built in world coordinates
// (layout.js SPOTS): his body is centred on x = 26, hers on x = 38, both facing +z.
// Parts: huHead (glances over at her), huTorso (breathes), huPage (turns now and then),
// wfHead (leans toward him, dips to sip), wfTorso (breathes), wfArms (upper arms, swing from the
// shoulders) + wfMug (forearms + mug, hinged at the elbows) to sip. Eyes blink through palette
// updates (only when the state changes). Steam over the mug fades while she drinks.
import { VoxelGrid, hash3 } from '../lib/index.js';

export const MATERIALS = {
  // --- him ---
  huSkin: { color: '#f2c9b0', jitter: 0.02 },
  huSkinShade: { color: '#e8b79c', jitter: 0.02 },
  huCheek: { color: '#efb4a4', jitter: 0.01 },
  huLip: { color: '#d88c84', jitter: 0.01 },
  huHair: { color: '#9c7452', jitter: 0.05 },
  huHairLight: { color: '#b98e64', jitter: 0.05 },
  huHairDark: { color: '#7d5a3c', jitter: 0.04 },
  huBrow: { color: '#8a6644', jitter: 0.02 },
  huBeard: { color: '#c98a4e', jitter: 0.07 },
  huBeardLight: { color: '#d69c60', jitter: 0.07 },
  huBeardDark: { color: '#b87a40', jitter: 0.06 },
  huGlasses: { color: '#86642c', metalness: 0.35, roughness: 0.4, jitter: 0.02, bevel: 0.4 },
  huLipEdge: { color: '#e2a294', jitter: 0.01 },
  huEye: { ao: 0.35, color: '#26323f', roughness: 0.25, jitter: 0 },
  huEyeTop: { ao: 0.35, color: '#5d7c94', roughness: 0.25, jitter: 0 },
  huEyeHi: { ao: 0.35, color: '#f5f9ff', roughness: 0.2, jitter: 0 },
  huHoodie: { color: '#34446c', jitter: 0.03, noise: { color: '#2b3a5e', scale: 0.25, amount: 0.5 } },
  huSleeve: { color: '#3a4b76', jitter: 0.03, noise: { color: '#314069', scale: 0.25, amount: 0.5 } },
  huHoodieDark: { color: '#253150', jitter: 0.03 },
  huHoodieLight: { color: '#40527e', jitter: 0.03 },
  huString: { color: '#a9b6cc', jitter: 0.02 },
  huPants: { color: '#d0b78e', jitter: 0.03, noise: { color: '#c0a67e', scale: 0.3, amount: 0.5 } },
  huPantsDark: { color: '#b69d74', jitter: 0.03 },
  huSock: { color: '#f5f3ee', jitter: 0.02 },
  huSockShade: { color: '#e0dcd2', jitter: 0.02 },
  huBook: { color: '#3f6a5a', jitter: 0.03 },
  huBookDark: { color: '#2e5044', jitter: 0.03 },
  huPage: { color: '#f4ead4', jitter: 0.015 },
  huPageLine: { color: '#cdbd9c', jitter: 0.02 },
  // --- her ---
  wfSkin: { color: '#f4cdb5', jitter: 0.02 },
  wfSkinShade: { color: '#e9b9a0', jitter: 0.02 },
  wfCheek: { color: '#f0a3a0', jitter: 0.01 },
  wfLip: { color: '#c06a6a', jitter: 0.01 },
  wfBrow: { color: '#b37c4a', jitter: 0.02 },
  wfEye: { ao: 0.35, color: '#2f6fb8', roughness: 0.25, jitter: 0 },          // blue iris
  wfEyeTop: { ao: 0.35, color: '#5e9ad8', roughness: 0.25, jitter: 0 },       // lighter blue lower iris
  wfEyeMid: { ao: 0.35, color: '#1c2430', roughness: 0.25, jitter: 0 },       // pupil
  wfEyeHi: { ao: 0.35, color: '#fbf6f0', roughness: 0.2, jitter: 0 },
  wfLash: { color: '#2a1c18', jitter: 0 },
  wfHair: { color: '#d8954a', jitter: 0.04 },
  wfHairDark: { color: '#c08040', jitter: 0.04 },
  wfHairLight: { color: '#e0a860', jitter: 0.04 },
  wfHairTip: { color: '#f0c27a', jitter: 0.04 },
  wfHairRoot: { color: '#a96c34', jitter: 0.03 },
  wfLipEdge: { color: '#d48a84', jitter: 0.01 },
  wfKnit: { color: '#e9dcc2', jitter: 0.03 },
  wfKnitDark: { color: '#d0be9c', jitter: 0.03 },
  wfKnitLight: { color: '#f6eedc', jitter: 0.02 },
  wfPants: { color: '#a9503a', jitter: 0.03, noise: { color: '#94442f', scale: 0.3, amount: 0.5 } },
  wfPantsDark: { color: '#8c3f2d', jitter: 0.03 },
  wfSock: { color: '#dba63f', jitter: 0.03 },
  wfSockDark: { color: '#c08c2e', jitter: 0.03 },
  wfMug: { color: '#e6ae3e', jitter: 0.02, roughness: 0.45 },
  wfMugStripe: { color: '#f7f0e4', jitter: 0.01, roughness: 0.45 },
  wfCoffee: { color: '#5a3622', roughness: 0.2, jitter: 0.02 },
};

// ---------------------------------------------------------------------------------------------- helpers
const h3 = (x, y, z, s) => hash3(x, y, z, s);

/** Rounded box over inclusive voxel ranges; m may be a function (x, y, z) → material (0 = skip). */
function rbox(g, a, b, r, m, mode) {
  const c = [0, 1, 2].map((i) => (a[i] + b[i] + 1) / 2);
  const hs = [0, 1, 2].map((i) => Math.max(0, (b[i] - a[i] + 1) / 2 - r));
  for (let y = a[1]; y <= b[1]; y++) for (let z = a[2]; z <= b[2]; z++) for (let x = a[0]; x <= b[0]; x++) {
    const q = [Math.abs(x + 0.5 - c[0]) - hs[0], Math.abs(y + 0.5 - c[1]) - hs[1], Math.abs(z + 0.5 - c[2]) - hs[2]];
    const d = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0) - r;
    if (d > 0) continue;
    const id = typeof m === 'function' ? m(x, y, z) : m;
    if (id) g.put(x, y, z, id, mode);
  }
}
const box = (g, a, b, m, mode) => g.box(a, b, m, { mode });
const span = (p, q) => [Math.min(p, q), Math.max(p, q)];
/** Run fn with the identity and with the mirror about x = c (left/right symmetric details). */
const both = (c, fn) => { fn((x) => x); fn((x) => 2 * c - x); };
const pick = (r, list) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** Parts win over lower-priority parts, the static figure and the room; the static figure wins over the room. */
function settle(g, statics, parts) {
  for (let i = 0; i < parts.length; i++) parts[i].forEach((x, y, z) => {
    for (let j = i + 1; j < parts.length; j++) parts[j].del(x, y, z);
    statics.del(x, y, z); g.del(x, y, z);
  });
  statics.forEach((x, y, z, id) => g.set(x, y, z, id));
}

// ---------------------------------------------------------------------------------------------- him
const HU_DX = -1;
function buildHusband(g, P) {
  const C = 26;                                 // body centre x
  const S = new VoxelGrid(P), T = new VoxelGrid(P), Hd = new VoxelGrid(P), Pg = new VoxelGrid(P);

  // --- legs (static): thighs along the seat, knees over the front edge, shins down, white socks
  const pants = 'huPants';
  both(C, (m) => {
    const [x0, x1] = span(m(23), m(25));
    rbox(S, [x0, 8, 9], [x1, 10, 21], 1, pants);                     // thigh
    rbox(S, [x0, 4, 19], [x1, 9, 21], 0.8, pants);                   // shin
    box(S, [x0, 4, 19], [x1, 4, 21], 'huPantsDark');                 // rolled cuff
    rbox(S, [x0, 1, 19], [x1, 3, 21], 0.6, 'huSock');               // ankle
    rbox(S, [x0, 1, 21], [x1, 2, 23], 0.8, 'huSock');               // foot
    box(S, [x0, 1, 19], [x1, 1, 23], 'huSockShade', 'paint');       // sole
  });
  box(S, [26, 8, 9], [26, 9, 15], pants);                            // crotch
  rbox(S, [23, 8, 8], [29, 11, 14], 1, 'huHoodie');                   // hips under the hoodie hem

  // --- torso part: hoodie, hood, arms, hands, book
  rbox(T, [23, 12, 8], [29, 18, 13], 1.5, 'huHoodie');
  rbox(T, [21, 15, 8], [31, 18, 13], 1.2, 'huHoodie');               // broad, soft shoulders
  box(T, [23, 12, 8], [29, 12, 14], 'huHoodieDark', 'paint');        // ribbed hem
  box(T, [24, 13, 13], [28, 14, 13], 'huHoodieLight', 'paint');      // kangaroo pocket
  box(T, [24, 15, 13], [28, 15, 13], 'huHoodieDark', 'paint');
  rbox(T, [22, 16, 6], [30, 21, 10], 1.3, 'huHoodieLight');           // hood bunched behind the neck
  box(T, [22, 16, 6], [30, 17, 7], 0);                                // (clear of the sofa back)
  box(T, [24, 18, 11], [28, 18, 13], 'huHoodieDark');                 // collar
  both(C, (m) => {
    let [a, b] = span(m(21), m(22));
    rbox(T, [a, 13, 9], [b, 19, 11], 0.9, 'huSleeve');               // upper arm
    rbox(T, [a, 12, 10], [b, 14, 14], 0.8, 'huSleeve');              // forearm
    box(T, [a, 12, 14], [b, 13, 14], 'huHoodieDark');                // cuff
    box(T, [m(22), 12, 15], [m(22), 12, 16], 'huSkin');              // hands holding the book's edges
  });
  box(T, [22, 11, 13], [30, 11, 18], 'huBook');                       // open book: cover
  box(T, [22, 11, 13], [30, 11, 13], 'huBookDark');
  const page = (edge) => (x, y, z) => ((z === 14 || z === 16) && x !== edge ? 'huPageLine' : 'huPage');
  box(T, [23, 12, 14], [25, 12, 17], page(23));
  box(T, [27, 12, 14], [29, 12, 17], page(29));
  box(T, [26, 11, 14], [26, 11, 17], 'huBookDark');
  both(C, (m) => T.set(m(23), 12, 15, 'huSkin'));                     // thumbs on the pages
  // the page that turns (copy of the right page; only shown while it flips)
  box(Pg, [27, 12, 14], [29, 12, 17], page(29));

  // --- head part (y 19..31): fair skin, raised ginger-blond beard, thin raised gold wire glasses
  const beard = (x, y, z) => pick(h3(x, y, z, 4), ['huBeard', 'huBeard', 'huBeard', 'huBeardLight']);
  const hair = (x, y, z) => pick(h3(x, y, z, 5), ['huHairDark', 'huHair', 'huHair', 'huHair', 'huHair', 'huHairLight']);
  const headMat = (x, y, z) => {
    const side = x <= 21 || x >= 31;
    if (y >= 30 || (z <= 8 && y >= 21) || (side && y >= 27 && z <= 14)) return hair(x, y, z);
    if (y <= 21 && z >= 10) return beard(x, y, z);                                // lower face
    if (side && y <= 26 && z >= 11 && z <= 14) return beard(x, y, z);              // jaw + sideburns
    return 'huSkin';
  };
  rbox(Hd, [21, 19, 7], [31, 31, 16], 1.5, headMat);
  // beard volume, one voxel proud: chin, jaw sides, moustache around a small smile
  for (let x = 21; x <= 31; x++) for (let y = 19; y <= 21; y++) {
    if (y === 19 && (x < 22 || x > 30)) continue;
    Hd.set(x, y, 17, beard(x, y, 17));
  }
  both(C, (m) => { for (let y = 19; y <= 21; y++) for (let z = 12; z <= 16; z++) if (!(y === 19 && z < 14)) Hd.set(m(20), y, z, beard(m(20), y, z)); });
  box(Hd, [25, 21, 17], [27, 22, 17], 'huBeardDark');                  // moustache
  box(Hd, [25, 20, 17], [27, 20, 17], 'huLip');                        // gentle smile, corners turned up
  Hd.set(24, 21, 17, 'huLipEdge'); Hd.set(28, 21, 17, 'huLipEdge');
  box(Hd, [22, 18, 12], [30, 18, 16], beard);                          // under the chin
  // hair volume: short, tousled, swept up at the front and over toward +x
  for (let x = 21; x <= 31; x++) for (let z = 7; z <= 17; z++) {
    const ex = Math.abs(x + 0.5 - 26.5) / 5.6, ez = Math.abs(z + 0.5 - 12) / 5.6;
    const e = Math.max(ex, ez);
    if (e > 1.02) continue;
    const front = z >= 13 ? 1 : 0;
    let top = 32.2 + front + (x >= 24 && z >= 12 ? 0.6 : 0) + (x >= 26 && z >= 14 ? 0.7 : 0) - e * e * 1.7 + (h3(x, 0, z, 3) - 0.5) * 1.1;
    let from = 30;
    if (z === 17) { if (x < 23 || x > 30) continue; from = 31; top = Math.max(top, 32.5); }
    for (let y = from; y <= Math.min(34, Math.round(top)); y++) Hd.set(x, y, z, hair(x, y, z));
  }
  for (const [x, y] of [[22, 29], [23, 29], [30, 29]]) Hd.set(x, y, 16, hair(x, y, 16));   // uneven hairline
  // face (front plane z = 16; frames and beard at z = 17)
  both(C, (m) => {
    Hd.set(m(22), 28, 16, 'huBrow'); Hd.set(m(23), 28, 16, 'huBrow');
    // a thin ring round each eye with a skin margin inside: tops/bottoms 4 wide, sides 4 tall
    for (let x = 21; x <= 24; x++) { Hd.set(m(x), 26, 17, 'huGlasses'); Hd.set(m(x), 22, 17, 'huGlasses'); }
    for (let y = 23; y <= 25; y++) { Hd.set(m(20), y, 17, 'huGlasses'); Hd.set(m(25), y, 17, 'huGlasses'); }
    for (let z = 12; z <= 16; z++) Hd.set(m(20), 25, z, 'huGlasses');                 // temple arm to the ear
    box(Hd, [m(20), 23, 10], [m(20), 25, 11], 'huSkinShade');                        // ear
    Hd.set(m(22), 23, 16, 'huCheek'); Hd.set(m(23), 23, 16, 'huCheek');              // rosy under the eyes
  });
  Hd.set(26, 24, 17, 'huGlasses');                                       // bridge
  for (const ex of [22, 29]) {                                           // eyes: highlight, blue-grey iris, dark
    Hd.set(ex, 25, 16, 'huEyeHi'); Hd.set(ex + 1, 25, 16, 'huEyeTop');
    Hd.set(ex, 24, 16, 'huEye'); Hd.set(ex + 1, 24, 16, 'huEye');
  }
  Hd.set(26, 23, 16, 'huSkinShade'); Hd.set(26, 23, 17, 'huSkin');       // nose

  // built around x = 26, then nudged one voxel toward the fire so the two heads keep a little gap
  const [hd, pg, tt, ss] = [Hd, Pg, T, S].map((src) => { const o = new VoxelGrid(P); src.forEach((x, y, z, id) => o.set(x + HU_DX, y, z, id)); return o; });
  settle(g, ss, [hd, pg, tt]);
  return [
    { name: 'huHead', grid: hd, pivot: [26.5 + HU_DX, 19.5, 11.5] },
    { name: 'huPage', grid: pg, pivot: [26.5 + HU_DX, 12.5, 16] },
    { name: 'huTorso', grid: tt, pivot: [26.5 + HU_DX, 12, 11] },
  ];
}

// ---------------------------------------------------------------------------------------------- her
const SHOULDER = [38.5, 17.5, 10], ELBOW = [38.5, 13.5, 10.5];
function buildWife(g, P) {
  const C = 38;
  const S = new VoxelGrid(P), T = new VoxelGrid(P), Hd = new VoxelGrid(P), A = new VoxelGrid(P), F = new VoxelGrid(P);

  const pants = (x, y, z) => (z === 9 && y === 10 ? 'wfPantsDark' : 'wfPants');
  // straight hair: colour varies by strand (x, z column), lighter toward the ends
  const strand = (x, y, z) => {
    const r = h3(x, 0, z, 21), k = h3(x, Math.floor(y / 4), z, 22);
    const v = r * 0.7 + k * 0.3 + (y <= 20 ? 0.22 : 0) + (y <= 16 ? 0.15 : 0);
    return v < 0.2 ? 'wfHairDark' : v < 0.6 ? 'wfHair' : v < 0.88 ? 'wfHairLight' : 'wfHairTip';
  };
  both(C, (m) => {
    const [x0, x1] = span(m(35), m(37));
    rbox(S, [x0, 8, 9], [x1, 10, 21], 1, pants);
    rbox(S, [x0, 5, 19], [x1, 9, 21], 0.8, pants);
    rbox(S, [x0, 1, 19], [x1, 4, 21], 0.6, (x, y) => (y === 4 ? 'wfSockDark' : 'wfSock'));
    rbox(S, [x0, 1, 21], [x1, 2, 23], 0.8, (x, y, z) => (z === 23 || y === 1 ? 'wfSockDark' : 'wfSock'));
  });
  box(S, [38, 8, 9], [38, 9, 15], pants);
  rbox(S, [35, 8, 8], [41, 11, 14], 1, pants);

  // torso: cream cable knit
  const knit = (x, y, z) => {
    if (y <= 12) return (x + z) % 2 ? 'wfKnitDark' : 'wfKnit';                // ribbed hem
    if (z >= 13) {                                                          // cables down the front
      const col = (x - 35) % 3;
      if (col === 1) return (y % 3 === 0) ? 'wfKnitDark' : 'wfKnitLight';
      return 'wfKnit';
    }
    return h3(x, y, z, 7) < 0.12 ? 'wfKnitLight' : 'wfKnit';
  };
  rbox(T, [35, 12, 9], [41, 18, 13], 1.5, knit);
  rbox(T, [33, 15, 9], [43, 18, 13], 1.2, knit);                             // soft, slightly wider shoulders
  box(T, [36, 18, 10], [40, 18, 13], 'wfKnitDark');                          // crew collar
  box(T, [37, 18, 10], [39, 18, 12], 'wfSkin');
  // long hair: down her back, and two tapering, slightly wavy curtains over the shoulders onto her chest
  box(T, [34, 12, 8], [42, 18, 8], (x, y, z) => strand(x, y, z));
  both(C, (m) => {
    const L = m === undefined ? 0 : (m(0) === 0 ? 0 : 1);                    // 0 = her right (-x) side, 1 = left
    const end = L ? 15 : 14;                                                 // uneven lengths
    const rows = { 18: [33, 36, 12], 17: [33, 36, 13], 16: [33, 35, 14], 15: [34, 36, 14], 14: [34, 35, 14], 13: [35, 35, 14] };
    for (let y = 18; y >= end; y--) {
      const [a, b, z0] = rows[y];
      for (let x0 = a; x0 <= b; x0++) for (let z = z0; z <= 15; z++) {
        if (z === 15 && (x0 === a || y <= 15)) continue;                     // rounded front, thinner tips
        const x = m(x0);
        T.set(x, y, z, strand(x, y, z));
      }
    }
    for (let z = 9; z <= 13; z++) { T.set(m(33), 18, z, strand(m(33), 18, z)); T.set(m(34), 18, z, strand(m(34), 18, z)); }
  });

  // upper arms (part, swing from the shoulders) and forearms + mug (part, hinged at the elbows)
  both(C, (m) => {
    let [a, b] = span(m(33), m(34));
    rbox(A, [a, 13, 9], [b, 18, 11], 0.9, 'wfKnit');                         // upper arm
    [a, b] = span(m(34), m(35));
    rbox(F, [a, 12, 10], [b, 14, 15], 0.8, 'wfKnit');                        // forearm
    box(F, [m(36), 12, 14], [m(36), 13, 17], 'wfKnitDark');                  // sweater-paw cuff
    F.set(m(37), 13, 18, 'wfSkin');                                          // fingertips round the mug
  });
  box(F, [37, 12, 15], [39, 16, 17], (x, y) => (y === 14 ? 'wfMugStripe' : 'wfMug'));
  F.set(38, 16, 16, 'wfCoffee');
  box(F, [40, 14, 16], [40, 15, 16], 'wfMug');                               // handle

  // head: skin, then soft hair around it with the face left open
  rbox(Hd, [34, 19, 7], [42, 28, 15], 1.5, 'wfSkin');
  const hairline = (x) => { const d = Math.abs(x + 0.5 - 37.5); return d < 1.5 ? 28 : d < 2.5 ? 27 : d < 3.5 ? 26 : 25; };
  const inFace = (x, y, z) => x >= 34 && x <= 42 && z >= 12 && y <= hairline(x);
  const hairMat = (x, y, z) => {
    if (inFace(x, y, z)) return 0;
    if (y <= 19 && z >= 10 && x >= 34 && x <= 42) return 0;                    // under the chin
    return strand(x, y, z);
  };
  // crown: a rounded dome (bevelled silhouette); below it the hair falls straight and long
  for (let y = 19; y <= 32; y++) for (let z = 5; z <= 16; z++) for (let x = 32; x <= 44; x++) {
    const ax = Math.abs(x + 0.5 - 38.5) / 6.2, az = Math.abs(z + 0.5 - 10.8) / 6.0;
    const ay = y + 0.5 > 24 ? (y + 0.5 - 24) / 8.2 : 0;
    if (ax ** 3 + az ** 3 + ay ** 2.6 > 1) continue;
    if (z >= 16) continue;
    const m = hairMat(x, y, z);
    if (m) Hd.set(x, y, z, m);
  }
  // part line: darker roots along it, a little off-centre
  for (let z = 8; z <= 15; z++) {
    let top = -1;
    for (let y = 32; y >= 26; y--) if (Hd.has(37, y, z)) { top = y; break; }
    if (top < 0) continue;
    Hd.set(37, top, z, 'wfHairRoot');
    for (const x of [36, 38]) for (let y = 32; y >= 26; y--) if (Hd.has(x, y, z)) { Hd.set(x, y, z, 'wfHairDark'); break; }
  }
  // face-framing curtains from the temples, past the jaw, slightly wavy
  both(C, (m) => {
    for (let y = 19; y <= 27; y++) {
      Hd.set(m(33), y, 16, strand(m(33), y, 16));
      if (y <= 20) Hd.set(m(34), y, 16, strand(m(34), y, 16));
    }
    for (let y = 19; y <= 22; y++) Hd.set(m(33), y, 15, strand(m(33), y, 15));
  });
  // face (front plane z = 15): big friendly eyes, lash flicks, rosy cheeks, a small soft smile
  for (const ex of [35, 40]) {                                              // 2×3: highlight on top, warm iris below
    Hd.set(ex, 25, 15, 'wfEyeHi'); Hd.set(ex + 1, 25, 15, 'wfEyeMid');
    Hd.set(ex, 24, 15, 'wfEye'); Hd.set(ex + 1, 24, 15, 'wfEye');
    Hd.set(ex, 23, 15, 'wfEyeTop'); Hd.set(ex + 1, 23, 15, 'wfEyeTop');
  }
  Hd.set(34, 26, 15, 'wfLash'); Hd.set(42, 26, 15, 'wfLash');
  both(C, (m) => { Hd.set(m(34), 22, 15, 'wfCheek'); Hd.set(m(35), 22, 15, 'wfCheek'); });
  box(Hd, [37, 20, 15], [39, 20, 15], 'wfLip');
  Hd.set(36, 21, 15, 'wfLipEdge'); Hd.set(40, 21, 15, 'wfLipEdge');

  settle(g, S, [Hd, F, A, T]);
  return [
    { name: 'wfHead', grid: Hd, pivot: [38.5, 19.5, 11.5] },
    { name: 'wfArms', grid: A, pivot: SHOULDER },
    { name: 'wfMug', grid: F, pivot: ELBOW },
    { name: 'wfTorso', grid: T, pivot: [38.5, 12, 11] },
  ];
}

// ---------------------------------------------------------------------------------------------- animation
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const phase = (t, period, offset) => ((t - offset) % period + period) % period;
/** 0→1→0 envelope in a repeating window: rises over `rise`, holds, falls over `fall`. */
function pulse(t, period, offset, rise, hold, fall) {
  const u = phase(t, period, offset);
  return smooth(0, rise, u) * (1 - smooth(rise + hold, rise + hold + fall, u));
}
const blinking = (t, period, offset) => {
  const u = phase(t, period, offset);
  return u < 0.13 || (Math.floor((t - offset) / period) % 3 === 1 && u > 0.3 && u < 0.43);
};

// closing an eye paints its voxels skin, except the ones that become the closed-lid line
const LIDS = { hu: ['huEyeTop', 'huEyeHi'], wf: ['wfEyeTop', 'wfEyeHi', 'wfEyeMid'] };
const CLOSED = {};

export function build(g, P, { stage } = {}) {
  const parts = [...buildHusband(g, P), ...buildWife(g, P)];
  const skin = { hu: P.def('huSkin').color, wf: P.def('wfSkin').color };
  const orig = {};
  for (const n of ['huEyeTop', 'huEyeHi', 'wfEyeTop', 'wfEyeHi', 'wfEyeMid']) orig[n] = P.def(n).color;
  const shut = { hu: false, wf: false };
  const setEyes = (who, closed) => {
    if (shut[who] === closed) return;
    shut[who] = closed;
    for (const n of LIDS[who]) P.update(n, { color: closed ? (CLOSED[n] ?? skin[who]) : orig[n] });
    P.texture();                       // refresh the material texture now (else it lags a frame)
  };

  // a thin wisp of steam over the mug (made here so it can fade while she sips; else handed to the scene)
  const STEAM = { preset: 'smoke', box: [[37.6, 17.4, 15.4], [39.4, 22, 17]], count: 6, size: 0.7, sizeJitter: 0.3, opacity: 0.22, speed: 0.1, glow: 0.5, sway: 0.4, turbulence: 0.3, colors: ['#f6efe4', '#e8e0d4'], seed: 7 };
  const steam = stage?.particles ? stage.particles(STEAM) : null;
  let steamOp = STEAM.opacity;

  return {
    parts,
    particles: steam ? [] : [STEAM],
    update(t, p) {
      // breathing (torso scales a hair; head and arms ride on top)
      const bh = Math.sin(t * 1.6) * 0.5 + 0.5, bw = Math.sin(t * 1.75 + 1.3) * 0.5 + 0.5;
      const sh = 1 + bh * 0.018, sw = 1 + bw * 0.02;
      const rest = (o) => o.userData.rest;
      if (p.huTorso) p.huTorso.scale.y = sh;
      if (p.wfTorso) p.wfTorso.scale.y = sw;
      // him: glances over at her now and then; turns a page every so often
      const look = pulse(t, 10, 3, 0.7, 2.6, 0.8);
      if (p.huHead) {
        p.huHead.position.y = rest(p.huHead)[1] + 7 * (sh - 1);
        p.huHead.rotation.set(-0.04 * look, 0.28 * look, -0.04 * look);
      }
      if (p.huPage) {
        const u = phase(t, 13, 6.5), f = smooth(0.05, 1.15, u);
        p.huPage.visible = f > 0.002 && f < 0.998;
        p.huPage.rotation.z = Math.PI * f;
        p.huPage.position.y = rest(p.huPage)[1] + Math.sin(Math.PI * f) * 0.35 + 0.02;
      }
      // her: head leans toward him; every so often she lifts the mug and sips
      const sip = pulse(t, 11, 1.5, 1.1, 1.4, 1.0);
      const lift = 6 * (sw - 1);
      const au = -0.95 * sip, af = -0.7 * sip;                // upper arm swing, forearm (mug) angle
      if (p.wfArms) {
        p.wfArms.position.y = SHOULDER[1] + lift;
        p.wfArms.rotation.x = au;
      }
      if (p.wfMug) {
        const dy = ELBOW[1] - SHOULDER[1], dz = ELBOW[2] - SHOULDER[2];
        p.wfMug.position.y = SHOULDER[1] + lift + dy * Math.cos(au) - dz * Math.sin(au);
        p.wfMug.position.z = SHOULDER[2] + dy * Math.sin(au) + dz * Math.cos(au);
        p.wfMug.rotation.x = af;
      }
      if (steam) {
        const op = Math.round(STEAM.opacity * (1 - smooth(0, 0.35, sip)) * 100) / 100;
        if (op !== steamOp) { steamOp = op; steam.set({ opacity: op }); }
      }
      if (p.wfHead) {
        p.wfHead.position.y = rest(p.wfHead)[1] + 7 * (sw - 1);
        p.wfHead.rotation.set(0.06 * sip, 0, 0.07 * (1 - sip) + 0.02 * Math.sin(t * 0.4));
      }
      setEyes('hu', blinking(t, 4.1, 0.7));
      setEyes('wf', sip > 0.6 || blinking(t, 3.6, 2.2));
    },
  };
}
