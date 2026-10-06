// Shared materials (same ids in every worker). Region-local materials: ctx.P.add('<region>_<name>', def).
import { NATURE, BUILD } from '../../lib/index.js';
export default {
  ...NATURE, ...BUILD,
  sea: { color: '#3f9fb8', kind: 'water', opacity: 0.45 },
  awningRed: { color: '#c8503e', jitter: 0.04 }, awningCream: { color: '#efe2c4', jitter: 0.03 },
  awningBlue: { color: '#4a78b0', jitter: 0.04 },
  apple: { color: '#d8402e', jitter: 0.08 }, hay: { color: '#e0c060', jitter: 0.08 },
};
