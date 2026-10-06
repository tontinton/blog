// Color helpers. Colors are accepted in any of these forms everywhere in the lib:
//   '#8bc34a'  '#8c4'  0x8bc34a  [0.55, 0.76, 0.29] (0..1 sRGB)  'rgb(139,195,74)'  'hsl(88, 50%, 53%)'
// Internally a color is an [r, g, b] array of sRGB values in 0..1.
//
//   shade('#8bc34a', -0.2)          darker (OKLab lightness), +0.2 lighter
//   mixColor('#f00', '#00f', 0.5)   perceptual mix (OKLab)
//   shift('#8bc34a', { h: 20, s: -0.1 })   hue degrees, saturation/lightness deltas
//   ramp('#5a9e3a', 4)              4 shades dark→light with a cool→warm hue drift (pixel-art style)
//   gradient(['#123', '#f80', '#fff'])(t)   multi-stop OKLab gradient → color

export function rgb(c) {
  if (Array.isArray(c)) return c.length >= 3 && Math.max(c[0], c[1], c[2]) > 1.0001 ? [c[0] / 255, c[1] / 255, c[2] / 255] : [c[0], c[1], c[2]];
  if (typeof c === 'number') return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  if (c && typeof c === 'object' && 'r' in c) return [c.r, c.g, c.b];
  if (typeof c !== 'string') throw new Error(`bad color: ${c}`);
  const s = c.trim().toLowerCase();
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  let m = s.match(/^rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(/[ ,/]+/).map(parseFloat); return [p[0] / 255, p[1] / 255, p[2] / 255]; }
  m = s.match(/^hsla?\(([^)]+)\)/);
  if (m) { const p = m[1].split(/[ ,/]+/).map(parseFloat); return fromHsl(p[0], p[1] / 100, p[2] / 100); }
  throw new Error(`bad color: ${c}`);
}

export function hex(c) {
  const [r, g, b] = rgb(c);
  const h = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
export const toInt = (c) => { const [r, g, b] = rgb(c); return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255); };

const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055);
export const srgbToLinear = (c) => rgb(c).map(toLin);
export const linearToSrgb = (c) => c.map(toSrgb);

export function hsl(c) {
  const [r, g, b] = rgb(c);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

// OKLab (perceptual) — used for mixing and lightness changes so shades don't go muddy.
export function oklab(c) {
  const [r, g, b] = srgbToLinear(c);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return linearToSrgb(lin).map((v) => Math.min(1, Math.max(0, v)));
}

export function mixColor(a, b, t) {
  const A = oklab(a), B = oklab(b);
  return fromOklab([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}
/** lighten (amount > 0) or darken (amount < 0); amount is in OKLab L units (~0.1 = noticeable). */
export function shade(c, amount) {
  const L = oklab(c);
  L[0] = Math.min(1, Math.max(0, L[0] + amount));
  return fromOklab(L);
}
/** shift hue (degrees) / saturation / lightness (deltas, 0..1 scale). */
export function shift(c, { h = 0, s = 0, l = 0 } = {}) {
  const [H, S, Lh] = hsl(c);
  return fromHsl(H + h, Math.min(1, Math.max(0, S + s)), Math.min(1, Math.max(0, Lh + l)));
}
/** multi-stop gradient: stops = [c0, c1, ...] (even spacing) or [[t, c], ...]. Returns t → color. */
export function gradient(stops) {
  const st = stops.map((s, i) => (Array.isArray(s) && s.length === 2 && typeof s[0] === 'number' && typeof s[1] !== 'number' ? [s[0], oklab(s[1])] : [i / Math.max(1, stops.length - 1), oklab(s)]));
  return (t) => {
    t = Math.min(1, Math.max(0, t));
    let i = 0;
    while (i < st.length - 2 && t > st[i + 1][0]) i++;
    const [t0, a] = st[i], [t1, b] = st[i + 1];
    const k = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    return fromOklab([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
  };
}
/** n shades of a base color, dark→light, with hue drifting cool→warm (classic pixel-art ramp). */
export function ramp(base, n = 4, { spread = 0.22, hueShift = 12, sat = 0.04 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1) - 0.5;
    out.push(shade(shift(base, { h: t * hueShift * 2, s: -Math.abs(t) * sat }), t * spread * 2));
  }
  return out;
}
/** relative luminance (0..1), handy for picking text colors etc. */
export const luminance = (c) => { const [r, g, b] = srgbToLinear(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
