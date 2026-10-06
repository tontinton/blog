// Tiny static server rooted at the blog's static/ dir, so /voxel/... URLs match production
// (plus voxel/lab/ test scenes at /voxel/_lab/?scene=name).
//   node serve.mjs [port]      (default 8737)
// Also exported as startServer() for shot.mjs.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../static');
// unpublished test scenes in voxel/lab/ are mounted at /voxel/_lab/ (they import ../lib/ like real pieces)
const LAB = resolve(dirname(fileURLToPath(import.meta.url)), '../lab');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.vox': 'application/octet-stream', '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

export function startServer(port = 8737) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const base = path.startsWith('/voxel/_lab/') ? LAB : ROOT;
      let file = base === LAB ? join(LAB, path.slice('/voxel/_lab/'.length)) : join(ROOT, path);
      if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
      let s = await stat(file).catch(() => null);
      if (s?.isDirectory()) {
        if (!path.endsWith('/')) { res.writeHead(301, { Location: path + '/' }).end(); return; }
        file = join(file, 'index.html');
        s = await stat(file).catch(() => null);
      }
      if (!s) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(file));
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8737;
  await startServer(port);
  console.log(`serving ${ROOT} at http://127.0.0.1:${port}/voxel/`);
}
