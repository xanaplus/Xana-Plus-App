import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the real Deno handlers in isolation. No network, database, SMS or payment calls.
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadHandler(name, tables = {}) {
  let handler;
  const db = { from: table => {
    const q = {
      select: () => q, eq: () => q, gte: () => q, order: () => q, limit: () => q,
      maybeSingle: () => q, delete: () => q, update: () => q,
      then: resolve => Promise.resolve(tables[table] ?? { data: null, error: null }).then(resolve),
    };
    return q;
  } };
  const context = {
    exports: {}, Request, Response, URLSearchParams, TextEncoder, crypto,
    console, fetch: vi.fn(() => { throw new Error('Unexpected external request'); }),
    Deno: { env: { get: () => undefined }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => db }),
  };
  vm.runInNewContext(compile('supabase/functions/_shared/otp.ts'), context);
  const helpers = context.exports;
  context.exports = {};
  context.require = () => helpers;
  vm.runInNewContext(compile(`supabase/functions/${name}/index.ts`), context);
  return { handler, externalFetch: context.fetch };
}

async function run(name, body, tables) {
  const { handler, externalFetch } = loadHandler(name, tables);
  const response = await handler(new Request('https://test.invalid', { method: 'POST', body: JSON.stringify(body) }));
  expect(externalFetch).not.toHaveBeenCalled();
  return { status: response.status, body: await response.json() };
}

describe('OTP server-side boundaries', () => {
  it('rejects invalid phone numbers before any SMS', async () => {
    expect(await run('request-otp', { phone: 'invalid' })).toMatchObject({ status: 400, body: { error: 'invalid_phone' } });
  });
  it('enforces the 30 second resend wait without sending', async () => {
    expect(await run('request-otp', { phone: '0700000001' }, { otp_codes: { data: [{ created_at: new Date().toISOString() }], error: null } }))
      .toMatchObject({ status: 429, body: { error: 'too_soon' } });
  });
  it('refuses a sixth retained code in the hourly window', async () => {
    const recent = Array.from({ length: 5 }, () => ({ created_at: new Date(Date.now() - 60000).toISOString() }));
    expect(await run('request-otp', { phone: '0700000001' }, { otp_codes: { data: recent, error: null } }))
      .toMatchObject({ status: 429, body: { error: 'too_many' } });
  });
  it('fails explicitly on rate-limit lookup errors', async () => {
    expect(await run('request-otp', { phone: '0700000001' }, { otp_codes: { data: null, error: { message: 'offline' } } }))
      .toMatchObject({ status: 500, body: { error: 'server_error' } });
  });
  it('rejects malformed codes', async () => {
    expect(await run('verify-otp', { phone: '0700000001', code: 'abc' })).toMatchObject({ status: 400, body: { error: 'wrong_code' } });
  });
  it('reports expired codes', async () => {
    expect(await run('verify-otp', { phone: '0700000001', code: '000000' }, { otp_codes: { data: { expires_at: new Date(0).toISOString() }, error: null } }))
      .toMatchObject({ status: 400, body: { error: 'expired' } });
  });
  it('stops verification after five incorrect attempts', async () => {
    expect(await run('verify-otp', { phone: '0700000001', code: '000000' }, { otp_codes: { data: { expires_at: new Date(Date.now() + 60000).toISOString(), attempts: 5 }, error: null } }))
      .toMatchObject({ status: 400, body: { error: 'too_many_attempts' } });
  });
});
