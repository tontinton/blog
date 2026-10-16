// Shared materials (same ids in every worker). Region-local materials: ctx.P.add('<region>_<name>', def) —
// always prefix with your region name so two regions never collide.
import { NATURE, BUILD, JUNGLE, UNDERSTORY, KARST, THAI } from '../lib/index.js';

export default {
  ...NATURE, ...BUILD, ...JUNGLE, ...UNDERSTORY, ...KARST, ...THAI,
  // ground (base.js)
  floor: { colors: ['#4c6a2a', '#56702e', '#46622a'], jitter: 0.05, noise: { color: '#3e5a26', scale: 0.12, amount: 0.5 } },   // forest floor
  floorLitter: { colors: ['#6e5e34', '#77663a', '#64552f'], jitter: 0.06 },                         // leaf litter
  floorMoss: { colors: ['#3f6a2c', '#4a7630', '#386226'], jitter: 0.05 },
  bank: { colors: ['#7a6448', '#86704f', '#6e5a40'], jitter: 0.06 },                                  // muddy river bank
  shore: { colors: ['#c0805a', '#b8764e', '#c98c64'], jitter: 0.05 },                                 // reservoir shore band (bare red earth)
  shoreRock: { colors: ['#a88a6c', '#9a7e62', '#b39478'], jitter: 0.06 },
  soil: { color: '#5a4030', jitter: 0.05 },
  soilDark: { color: '#43301f', jitter: 0.05 },
  laterite: { color: '#a8583a', jitter: 0.05, noise: { color: '#8e4630', scale: 0.2, amount: 0.6 } }, // Thai red earth
  clayBand: { color: '#b88a5e', jitter: 0.05 },
  bedrock: { color: '#857c70', jitter: 0.06 },
  bedrockDark: { color: '#665e55', jitter: 0.06 },
  silt: { colors: ['#7e7052', '#857757', '#77694c'], jitter: 0.05 },                                  // lake bed
  sandJ: { colors: ['#d4c194', '#cbb88b', '#dccb9f'], jitter: 0.04 },
  riverBed: { colors: ['#8e877a', '#a29a8a', '#7a7468', '#b3aa98'], jitter: 0.05 },                   // pebbles
  lakeWater: { color: '#22806f', kind: 'water', opacity: 0.6 },                                          // emerald Cheow Lan
  riverWater: { color: '#4aa890', kind: 'water', opacity: 0.32 },
  lakeClear: { color: '#a4e4d6', kind: 'glass', opacity: 0.08, ior: 1.1 },   // lake water below the surface near the outer walls: a clear cutaway (deep water faces glow milky)
  mistCloud: { color: '#eef2f4', jitter: 0.02, roughness: 1, shadow: false, ao: 0.25, emissive: 0.12, emissiveColor: '#f4f3ef' }, // low cloud banks: soft, cool, never reads as rock
  mistCloudShade: { color: '#d4dce2', jitter: 0.02, roughness: 1, shadow: false, ao: 0.25, emissive: 0.06, emissiveColor: '#e6ebee' },
};
