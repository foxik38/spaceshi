#!/usr/bin/env node
/**
 * Zero-dependency static file server for the production build.
 *
 *   npm start                     # builds if dist/ is missing, then serves on 0.0.0.0:8080
 *   PORT=3000 HOST=127.0.0.1 npm start
 *
 * Responses are gzip/brotli compressed (once per file, then cached in memory) and hashed assets are marked immutable.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync, constants as zc } from 'node:zlib';
import { networkInterfaces } from 'node:os';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

if (!existsSync(join(dist, 'index.html'))) {
  console.log('dist/ not found — building first (this happens once)…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  if (!existsSync(join(root, 'node_modules'))) spawnSync(npm, ['install'], { cwd: root, stdio: 'inherit' });
  const r = spawnSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json', '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.bin', '.svg', '.txt', '.map']);
const cache = new Map(); // path -> { mtime, br, gz }

function compressed(path, st) {
  let e = cache.get(path);
  if (!e || e.mtime !== st.mtimeMs) {
    const raw = readFileSync(path);
    e = {
      mtime: st.mtimeMs,
      br: brotliCompressSync(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 9, [zc.BROTLI_PARAM_SIZE_HINT]: raw.length } }),
      gz: gzipSync(raw, { level: 9 }),
    };
    cache.set(path, e);
  }
  return e;
}

const server = createServer((req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    const url = new URL(req.url ?? '/', 'http://localhost');
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    let file = join(dist, rel);
    if (file !== dist && !file.startsWith(dist + sep)) { res.writeHead(403).end('forbidden'); return; }
    let st = existsSync(file) ? statSync(file) : null;
    if (st?.isDirectory()) { file = join(file, 'index.html'); st = existsSync(file) ? statSync(file) : null; }
    if (!st) {
      // unknown paths fall back to the app shell unless they look like an asset request
      if (extname(rel)) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return; }
      file = join(dist, 'index.html'); st = statSync(file);
    }
    const ext = extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': /[\\/]assets[\\/]/.test(file) ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Accept-Encoding',
    };
    const accept = String(req.headers['accept-encoding'] ?? '');
    if (COMPRESSIBLE.has(ext) && st.size > 512 && /\b(br|gzip)\b/.test(accept)) {
      const c = compressed(file, st);
      const useBr = /\bbr\b/.test(accept);
      const body = useBr ? c.br : c.gz;
      res.writeHead(200, { ...headers, 'Content-Encoding': useBr ? 'br' : 'gzip', 'Content-Length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('server error');
    console.error(err);
  }
});

server.listen(port, host, () => {
  console.log(`\n  Spaceshi is up.\n`);
  console.log(`  Local:    http://localhost:${port}/`);
  if (host === '0.0.0.0') {
    for (const list of Object.values(networkInterfaces())) {
      for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`  Network:  http://${n.address}:${port}/`);
    }
  }
  console.log('');
});
