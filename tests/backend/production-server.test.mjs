import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { productionServer, WEB_BUILD_ROOT } from '../../scripts/serve-production.mjs';

let root, server, base;
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'xanaplus-web-'));
  writeFileSync(join(root, 'index.html'), '<html>XanaPlus fixture</html>');
  mkdirSync(join(root, '_expo/static/js/web'), { recursive: true });
  writeFileSync(join(root, '_expo/static/js/web/app.js'), 'console.log("fixture");');
  server = productionServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});
describe('production Expo web serving', () => {
  it('builds into the server directory and retains it in the deployment package', () => {
    const project = new URL('../../', import.meta.url);
    const pkg = JSON.parse(readFileSync(new URL('package.json', project), 'utf8'));
    const output = pkg.scripts['build:web'].match(/--output-dir\s+(\S+)/)[1];
    expect(resolve(new URL(project).pathname, output)).toBe(resolve(WEB_BUILD_ROOT));
    const excluded = readFileSync(new URL('.replitignore', project), 'utf8')
      .split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
      .map(line => line.replace(/^\/|\/$/g, ''));
    expect(excluded.some(path => output === path || output.startsWith(`${path}/`))).toBe(false);
  });
  it('responds to the startup probe with HTML and no cache', async () => {
    const res = await fetch(base);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });
  it('supports browser deep links without a dev server or authentication bypass', async () => {
    const res = await fetch(`${base}/pharmacy/prescription/example?test=1`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<html>XanaPlus fixture</html>');
  });
  it('serves real assets with correct types and immutable caching', async () => {
    const res = await fetch(`${base}/_expo/static/js/web/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });
  it('does not serve the SPA as a missing JavaScript asset', async () => {
    expect((await fetch(`${base}/missing.js`)).status).toBe(404);
  });
  it('supports HEAD for probes without sending a body', async () => {
    const res = await fetch(base, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
  it('rejects malformed/traversal paths and does not expose source files', async () => {
    expect((await fetch(`${base}/%2e%2e%2fpackage.json`)).status).toBe(400);
    expect((await fetch(`${base}/%ZZ`)).status).toBe(400);
    expect((await fetch(`${base}/src/lib/supabase.ts`)).status).toBe(404);
  });
  it('does not accept write requests or silently start without a build', async () => {
    expect((await fetch(base, { method: 'POST' })).status).toBe(405);
    expect(() => productionServer(join(root, 'missing'))).toThrow(/build missing/i);
  });
});
