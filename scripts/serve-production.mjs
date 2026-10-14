import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('../generated-artifacts/web/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

/** Serves only the exported Expo SPA; Supabase remains the existing backend. */
export function productionServer(root = DEFAULT_ROOT) {
  root = resolve(root);
  const index = resolve(root, 'index.html');
  if (!existsSync(index)) throw new Error('Web build missing. Run npm run build:web before starting production.');
  return createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end('Invalid path');
      return;
    }
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(400).end('Invalid path');
      return;
    }
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let stat;
    try {
      stat = statSync(file);
      if (stat.isDirectory()) {
        file = resolve(file, 'index.html');
        stat = statSync(file);
      }
    } catch {
      if (extname(pathname)) {
        res.writeHead(404).end('Not found');
        return;
      }
      // Expo Router resolves browser deep links from the single-page shell.
      file = index;
      stat = statSync(index);
    }
    if (!stat.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', extname(file) === '.html'
      ? 'no-cache'
      : pathname.startsWith('/_expo/static/') || pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600');
    if (req.method === 'HEAD') {
      res.writeHead(200).end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => {
      if (res.headersSent) res.destroy();
      else res.writeHead(500).end('Unable to read asset');
    });
    stream.pipe(res);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid production PORT');
  const server = productionServer();
  server.listen(port, '0.0.0.0', () => console.log(`XanaPlus web serving on 0.0.0.0:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
