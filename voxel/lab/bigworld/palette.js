// Shared palette for every region (workers rebuild it from this module, so ids match everywhere).
import { NATURE, BUILD } from '../../lib/index.js';
export default {
  ...NATURE, ...BUILD,
  paving: { colors: ['#c9bba0', '#bfb092', '#d2c4aa'], jitter: 0.04, grid: 0.3 },
  adobe: { colors: ['#e3d3b4', '#dccaa6', '#e9dcc0'], jitter: 0.05 },
  adobeTrim: { color: '#b4553e', jitter: 0.05 },
  flatRoof: { color: '#cdb995', jitter: 0.05 },
  canal: { color: '#3d8f9a', kind: 'water', opacity: 0.45 },
  bank: { color: '#8a7d6a', jitter: 0.06, grid: 0.4 },
  temple: { colors: ['#e8e0cc', '#ded4bc'], jitter: 0.04, grid: 0.25 },
  templeRed: { color: '#c2412f', jitter: 0.04 },
  templeBlue: { color: '#3f7fb8', jitter: 0.04 },
  brazier: { colors: ['#ff8a2a', '#ffb347'], emissive: 6, flicker: 0.5, light: { color: '#ff9a40', radius: 9, intensity: 1.3 } },
  chinampa: { colors: ['#5f9a3a', '#6aa844', '#558f34'], jitter: 0.05 },
};
