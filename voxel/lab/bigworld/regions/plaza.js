// The central plaza with a twin-shrine stepped pyramid (exercises big solid geometry + emissive braziers).
export default function build(g, ctx) {
  const { x: X, z: Z } = ctx.options;
  const S = 96, c = [X + 48, 1, Z + 48];
  g.box([X, -4, Z], [X + S - 1, -1, Z + S - 1], 'bank');
  g.box([X, 0, Z], [X + S - 1, 0, Z + S - 1], 'paving');
  g.pyramid(c, 30, 'temple', { step: 2 });
  g.box([c[0] - 4, 1, c[2] + 6], [c[0] + 4, 60, c[2] + 31], 0, { mode: 'carve' });          // stair cut
  for (let i = 0; i < 26; i++) g.box([c[0] - 3, 1 + i * 2, c[2] + 31 - i], [c[0] + 3, 2 + i * 2, c[2] + 31 - i], 'temple'); // stairs
  for (const dx of [-8, 8]) {
    g.box([c[0] + dx - 5, 61, c[2] - 5], [c[0] + dx + 5, 70, c[2] + 5], dx < 0 ? 'templeRed' : 'templeBlue', { hollow: true });
    g.box([c[0] + dx - 6, 71, c[2] - 6], [c[0] + dx + 6, 72, c[2] + 6], 'temple');
    g.set(c[0] + dx, 73, c[2] + 6, 1 && g.palette.brazier);
  }
  for (const [dx, dz] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) g.box([c[0] + dx, 1, c[2] + dz], [c[0] + dx + 1, 3, c[2] + dz + 1], 'brazier');
  ctx.emit('particles', { preset: 'embers', count: 40, box: [[c[0] - 14, 72, c[2] - 2], [c[0] + 14, 90, c[2] + 8]] });
}
