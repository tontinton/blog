// Scaffold a new piece from voxel/template into static/voxel/<slug>/ and register it in pieces.json.
//   node new.mjs <slug> "Title" "One-line description." [look]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOKS, resolveLook } from '../../static/voxel/lib/looks.js';

const here = dirname(fileURLToPath(import.meta.url));
const [slug, title, description = '', look = 'studio'] = process.argv.slice(2);
if (!slug || !title || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('usage: node new.mjs <slug> "Title" "Description." [look]   (slug: a-z 0-9 -)');
  process.exit(2);
}
if (!LOOKS[look]) { console.error(`unknown look ${look}; have ${Object.keys(LOOKS).join(', ')}`); process.exit(2); }
const dir = resolve(here, '../../static/voxel', slug);
if (existsSync(dir)) { console.error(`${dir} already exists`); process.exit(1); }
mkdirSync(dir, { recursive: true });
const bg = resolveLook(look).background.colors.at(-1);
const fill = (s) => s.replaceAll('{{SLUG}}', slug).replaceAll('{{TITLE}}', title).replaceAll('{{DESCRIPTION}}', description).replaceAll('{{LOOK}}', look).replaceAll('{{BG}}', bg);
for (const f of ['index.html', 'scene.js']) writeFileSync(resolve(dir, f), fill(readFileSync(resolve(here, '../template', f), 'utf8')));
const manifest = resolve(here, '../../static/voxel/pieces.json');
const list = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : [];
list.push({ slug, title, description, date: new Date().toISOString().slice(0, 10), preview: `/voxel/${slug}/preview.jpg`, tags: [] });
writeFileSync(manifest, JSON.stringify(list, null, 2) + '\n');
console.log(`created static/voxel/${slug}/ (index.html, scene.js) and added it to pieces.json
next:  node shot.mjs /voxel/${slug}/ --views 4          # look at it
       node shot.mjs /voxel/${slug}/ --size 1200x630 --out ../../static/voxel/${slug}/preview.jpg`);
