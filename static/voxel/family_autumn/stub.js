// Stand-in furniture for solo previews (?solo=dog) while room.js is being built: plain boxes with the
// exact dimensions of layout.js, so characters can be fitted before the real room exists.
import { ROOM, FIRE, SOFA, SPOTS } from './layout.js';

export const MATERIALS = {
  stubFloor: { color: '#9a6a44', jitter: 0.05, grid: 0.2 },
  stubWall: { color: '#7a5236', jitter: 0.05 },
  stubSofa: { color: '#5d7a6a', jitter: 0.03 },
  stubCushion: { color: '#c9a77a', jitter: 0.03 },
  stubStone: { color: '#8a8580', jitter: 0.08 },
  stubFire: { color: '#ffb050', emissive: 5, flicker: 0.4, light: { color: '#ff9a40', radius: 26, intensity: 1.2 } },
  stubRug: { color: '#b0563a', jitter: 0.03 },
};

export function build(g) {
  const { x0, x1, z0, z1 } = ROOM;
  g.box([x0 - 3, -2, z0 - 3], [x1, 0, z1], 'stubFloor');
  g.box([x0 - 3, 1, z0 - 3], [x1, 12, z0 - 1], 'stubWall');
  g.box([x0 - 3, 1, z0], [x0 - 1, 12, z1], 'stubWall');
  g.box([0, 1, FIRE.z0], [FIRE.depth - 1, 20, FIRE.z1], 'stubStone');
  g.box([0, 1, FIRE.opening.z0], [FIRE.depth - 1, FIRE.opening.y1, FIRE.opening.z1], 0);
  g.box([1, 1, 15], [2, 3, 19], 'stubFire');
  const S = SOFA;
  g.box([S.x0, 1, S.z0], [S.x1, S.seatTop, S.z1], 'stubSofa');
  g.box([S.x0, 1, S.back.z0], [S.x1, S.back.top, S.back.z1], 'stubSofa');
  for (const [a, b] of S.arms) g.box([a, 1, S.z0], [b, S.armTop, S.z1], 'stubSofa');
  g.box([S.arms[0][1] + 1, S.seatTop, S.seatZ[0]], [S.arms[1][0] - 1, S.seatTop, S.seatZ[1]], 'stubCushion');
  g.box([6, 1, 24], [52, 1, 48], 'stubRug');
  g.cylinder([44, 1, 35], 6, 4, 'stubCushion');                     // pouf (fat cat)
  g.box([49, 1, 0], [63, 9, 10], 'stubSofa');                         // window seat (kitten)
  return {};
}
export const SPOT = SPOTS;
