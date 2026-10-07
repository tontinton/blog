// Shared layout for Family Autumn: every module (room.js, people.js, dog.js, cats.js) builds against
// these numbers so the pieces fit together. World coords = grid coords, Y up, inclusive ranges.
// The camera looks from +x/+z (yaw ~35°), so characters face +z (toward the viewer).
//
// Cutaway log cabin: only the back wall (−z) and the left wall (−x) exist; the +x and +z sides are open.

export const ROOM = {
  x0: 0, x1: 63, z0: 0, z1: 51,      // interior floor cells
  floorY: 0,                         // top of the floor planks; things stand on y = 1
  wallH: 40,                         // walls rise to y = 40
  backWall: { z0: -3, z1: -1 },      // back wall slab (x from −3 to 63)
  leftWall: { x0: -3, x1: -1 },      // left wall slab (z from −3 to 51)
};

// Stone fireplace on the left wall, opening faces +x (toward the room).
export const FIRE = {
  z0: 9, z1: 25,                     // stone surround footprint along the wall
  depth: 5,                          // protrudes x = 0..4 into the room (hearth slab may go to x = 6)
  opening: { z0: 13, z1: 21, y0: 1, y1: 9 },
  flame: [2, 2, 17],                 // centre of the flames
  mantelY: 16,
};

// Big sofa, back against the back wall, facing +z.
export const SOFA = {
  x0: 16, x1: 46, z0: 2, z1: 18,
  seatTop: 7,                        // top of the seat cushions; sitters' bottoms rest at y = 8
  seatZ: [8, 18],                    // seat depth (front edge at z = 18)
  back: { z0: 2, z1: 7, top: 17 },
  arms: [[16, 19], [43, 46]], armTop: 11,
};

// Where each character lives (anchor = bottom-centre of the character, on its support surface).
// Zones are reserved: the room must not put furniture inside them (except the support itself).
export const SPOTS = {
  husband: { anchor: [26, 8, 13], zone: [[20, 8, 4], [31, 34, 24]] },          // left seat (screen-left)
  wife: { anchor: [37, 8, 13], zone: [[32, 8, 4], [42, 34, 24]] },             // right seat
  dog: { anchor: [15, 1, 34], zone: [[2, 1, 22], [30, 22, 51]] },              // lying on the rug, facing +z
  fatcat: { anchor: [44, 5, 35], zone: [[36, 5, 27], [52, 22, 44]], support: 'pouf: round floor cushion, centre (44, 35), radius 6, top y = 4' },
  kitten: { anchor: [56, 10, 5], zone: [[50, 10, 1], [62, 26, 10]], support: 'window seat: x 49..63, z 0..10, cushion top y = 9' },
};

export const WINDOW = { x0: 50, x1: 62, y0: 13, y1: 31 };   // big window in the back wall, behind the kitten

// Camera: what the full scene uses; solo views target the character.
export const CAMERA = { yaw: 35, pitch: 24, target: [30, 19, 22], zoom: 1.5 };
export const FOCUS = {
  husband: [26, 20, 14], wife: [37, 20, 14], people: [31, 19, 14], dog: [15, 8, 36],
  fatcat: [44, 11, 35], kitten: [56, 16, 5], cats: [50, 12, 20], room: [30, 14, 24],
};
