import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOtpDatabase } from './otp-db.mjs';

// Real Deno handlers + real PostgreSQL RPCs. SMS and Auth are strictly local
// mocks: these sample numbers must NEVER be sent to a provider.
const PHONE = '0700000001';
const NORMALIZED = '+254700000001';
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadHandler(name, database, options = {}) {
  let handler;
  const auth = {
    admin: {
      createUser: vi.fn(async () => ({ error: null })),
      generateLink: vi.fn(async () => ({ data: { user: { id: 'test-only-user' }, properties: { hashed_token: 'test-only-link' } }, error: null })),
    },
    verifyOtp: vi.fn(async () => ({ data: { session: { access_token: 'test-only-access', refresh_token: 'test-only-refresh' } }, error: null })),
  };
  const db = {
    rpc: options.rpc ?? vi.fn((name, params) => database.rpc(name, params)),
    auth,
    from: table => {
      if (table !== 'profiles') throw new Error(`Non-atomic OTP access: ${table}`);
      return { upsert: async () => ({ error: null }) };
    },
  };
  const messages = [];
  const externalFetch = vi.fn(async (_url, init) => {
    messages.push(new URLSearchParams(init.body).get('message'));
    if (options.smsThrows) throw new Error('Simulated network failure');
    return Response.json({ SMSMessageData: { Recipients: [{ status: options.smsStatus ?? 'Success' }] } });
  });
  const env = { DEMO_PHONE: '0700000000', DEMO_CODE: '123456' };
  const context = {
    exports: {}, Request, Response, URLSearchParams, TextEncoder, crypto,
    console: { error: vi.fn() }, fetch: externalFetch,
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => db }),
  };
  vm.runInNewContext(compile('supabase/functions/_shared/otp.ts'), context);
  const helpers = context.exports;
  context.exports = {};
  context.require = () => helpers;
  vm.runInNewContext(compile(`supabase/functions/${name}/index.ts`), context);
  return {
    externalFetch, auth, db, messages, helpers,
    async run(body) {
      const response = await handler(new Request('https://test.invalid', { method: 'POST', body: JSON.stringify(body) }));
      return { status: response.status, body: await response.json() };
    },
  };
}

describe('OTP atomic server-side boundaries (isolated PostgreSQL)', () => {
  let database;
  beforeAll(() => { database = createOtpDatabase(); }, 30000);
  afterAll(() => database?.close());
  beforeEach(async () => { await database.sql('truncate public.otp_codes, public.otp_requests'); });
  const request = options => loadHandler('request-otp', database, options);
  const verify = options => loadHandler('verify-otp', database, options);
  const age = () => database.sql("update public.otp_requests set created_at = created_at - interval '31 seconds'");
  const deliveredCode = sender => sender.messages.at(-1).match(/code is (\d{6})/)[1];
  const count = table => database.sql(`select count(*) from public.${table}`);

  it('rejects invalid phone numbers and malformed codes before database or SMS access', async () => {
    const sender = request();
    expect(await sender.run({ phone: 'invalid' })).toMatchObject({ status: 400, body: { error: 'invalid_phone' } });
    expect(sender.db.rpc).not.toHaveBeenCalled();
    expect(sender.externalFetch).not.toHaveBeenCalled();
    const verifier = verify();
    expect(await verifier.run({ phone: PHONE, code: 'abc' })).toMatchObject({ status: 400, body: { error: 'wrong_code' } });
    expect(verifier.db.rpc).not.toHaveBeenCalled();
  });

  it('preserves configured demo sign-in without database OTP operations or SMS', async () => {
    const sender = request();
    expect(await sender.run({ phone: '0700000000' })).toMatchObject({ status: 200 });
    expect(sender.db.rpc).not.toHaveBeenCalled();
    expect(sender.externalFetch).not.toHaveBeenCalled();
    const verifier = verify();
    expect(await verifier.run({ phone: '0700000000', code: '000000' })).toMatchObject({ body: { error: 'wrong_code' } });
    expect(await verifier.run({ phone: '0700000000', code: '123456' })).toMatchObject({ status: 200, body: { access_token: 'test-only-access' } });
    expect(verifier.db.rpc).not.toHaveBeenCalled();
    expect(verifier.externalFetch).not.toHaveBeenCalled();
  });

  it('allows just one of twelve simultaneous sends and keeps the resend wait', async () => {
    const sender = request();
    const results = await Promise.all(Array.from({ length: 12 }, () => sender.run({ phone: PHONE })));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.body.error === 'too_soon')).toHaveLength(11);
    expect(sender.externalFetch).toHaveBeenCalledTimes(1);
    expect(await count('otp_requests')).toBe('1');
    expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 429, body: { error: 'too_soon' } });
  });

  it('keeps the hourly limit and cooldown after successful consumption', async () => {
    const sender = request();
    const verifier = verify();
    for (let i = 0; i < 5; i++) {
      expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 200 });
      expect(await verifier.run({ phone: PHONE, code: deliveredCode(sender) })).toMatchObject({ status: 200 });
      expect(await count('otp_codes')).toBe('0');
      expect(await sender.run({ phone: PHONE })).toMatchObject({ body: { error: 'too_soon' } });
      await age();
    }
    expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 429, body: { error: 'too_many' } });
    expect(sender.externalFetch).toHaveBeenCalledTimes(5);
    expect(await count('otp_requests')).toBe('5');
  });

  it('allows only the fifth request when concurrent callers reach the hourly boundary', async () => {
    const sender = request();
    for (let i = 0; i < 4; i++) {
      await sender.run({ phone: PHONE });
      await age();
    }
    const results = await Promise.all(Array.from({ length: 8 }, () => sender.run({ phone: PHONE })));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(await count('otp_requests')).toBe('5');
    await age();
    expect(await sender.run({ phone: PHONE })).toMatchObject({ body: { error: 'too_many' } });
    expect(sender.externalFetch).toHaveBeenCalledTimes(5);
  });

  it('does not reset the hourly limit when every code exhausts its attempts', async () => {
    const sender = request();
    const verifier = verify();
    for (let i = 0; i < 5; i++) {
      await sender.run({ phone: PHONE });
      const right = deliveredCode(sender);
      const wrong = right === '000000' ? '111111' : '000000';
      for (let j = 0; j < 5; j++) await verifier.run({ phone: PHONE, code: wrong });
      expect(await verifier.run({ phone: PHONE, code: right })).toMatchObject({ body: { error: 'too_many_attempts' } });
      await age();
    }
    expect(await sender.run({ phone: PHONE })).toMatchObject({ body: { error: 'too_many' } });
    expect(await count('otp_requests')).toBe('5');
    expect(verifier.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it.each(['UserInBlacklist', 'InvalidPhoneNumber', 'Failed', 'network'])('charges failed delivery (%s) to the durable limit', async status => {
    const sender = request({ smsStatus: status, smsThrows: status === 'network' });
    for (let i = 0; i < 5; i++) {
      expect((await sender.run({ phone: PHONE })).status).toBe(status === 'UserInBlacklist' ? 422 : status === 'InvalidPhoneNumber' ? 400 : 502);
      expect(await count('otp_codes')).toBe('0');
      expect(await sender.run({ phone: PHONE })).toMatchObject({ body: { error: 'too_soon' } });
      await age();
    }
    expect(await sender.run({ phone: PHONE })).toMatchObject({ body: { error: 'too_many' } });
    expect(sender.externalFetch).toHaveBeenCalledTimes(5);
    expect(await count('otp_requests')).toBe('5');
  });

  it('permits one session from concurrent correct verifications and rejects replay', async () => {
    const sender = request();
    await sender.run({ phone: PHONE });
    const verifier = verify();
    const body = { phone: PHONE, code: deliveredCode(sender) };
    const results = await Promise.all(Array.from({ length: 12 }, () => verifier.run(body)));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.body.error === 'expired')).toHaveLength(11);
    expect(verifier.auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(await verifier.run(body)).toMatchObject({ status: 400, body: { error: 'expired' } });
    expect(await count('otp_requests')).toBe('1');
  });

  it('counts simultaneous incorrect attempts without lost increments and locks out the correct code', async () => {
    const sender = request();
    await sender.run({ phone: PHONE });
    const verifier = verify();
    const right = deliveredCode(sender);
    const wrong = right === '000000' ? '111111' : '000000';
    const results = await Promise.all(Array.from({ length: 12 }, () => verifier.run({ phone: PHONE, code: wrong })));
    expect(results.filter(r => r.body.error === 'wrong_code')).toHaveLength(5);
    expect(results.filter(r => r.body.error === 'too_many_attempts')).toHaveLength(7);
    expect(await database.sql('select attempts from public.otp_codes')).toBe('5');
    expect(await verifier.run({ phone: PHONE, code: right })).toMatchObject({ body: { error: 'too_many_attempts' } });
    expect(verifier.auth.verifyOtp).not.toHaveBeenCalled();
    expect(await count('otp_requests')).toBe('1');
  });

  it('rejects expired codes and does not revive older codes after a resend', async () => {
    const sender = request();
    await sender.run({ phone: PHONE });
    const old = deliveredCode(sender);
    await database.sql("update public.otp_codes set expires_at = now() - interval '1 second'");
    expect(await verify().run({ phone: PHONE, code: old })).toMatchObject({ body: { error: 'expired' } });
    await age();
    await sender.run({ phone: PHONE });
    const current = deliveredCode(sender);
    // Extremely unlikely random collision is not an assertion about a stale hash.
    if (old !== current) expect(await verify().run({ phone: PHONE, code: old })).toMatchObject({ body: { error: 'wrong_code' } });
    expect(await count('otp_codes')).toBe('1');
  });

  it('holds pending delivery out of verification and ignores delayed failure of an older send', async () => {
    const helper = verify().helpers;
    const hash = await helper.hashCode(NORMALIZED, '123456');
    const first = await database.rpc('reserve_otp', { p_phone: NORMALIZED, p_code_hash: hash });
    expect(await verify().run({ phone: PHONE, code: '123456' })).toMatchObject({ body: { error: 'expired' } });
    await age();
    const second = await database.rpc('reserve_otp', { p_phone: NORMALIZED, p_code_hash: hash });
    await database.rpc('finish_otp_delivery', { p_phone: NORMALIZED, p_id: second.data.id, p_sent: true });
    await database.rpc('finish_otp_delivery', { p_phone: NORMALIZED, p_id: first.data.id, p_sent: false });
    expect(await verify().run({ phone: PHONE, code: '123456' })).toMatchObject({ status: 200 });
    expect(await count('otp_requests')).toBe('2');
  });

  it('serializes resend and verification without consuming the replacement code', async () => {
    const helper = verify().helpers;
    const oldHash = await helper.hashCode(NORMALIZED, '123456');
    const newHash = await helper.hashCode(NORMALIZED, '654321');
    const first = await database.rpc('reserve_otp', { p_phone: NORMALIZED, p_code_hash: oldHash });
    await database.rpc('finish_otp_delivery', { p_phone: NORMALIZED, p_id: first.data.id, p_sent: true });
    await age();
    const [consumed, reserved] = await Promise.all([
      database.rpc('consume_otp', { p_phone: NORMALIZED, p_code_hash: oldHash }),
      database.rpc('reserve_otp', { p_phone: NORMALIZED, p_code_hash: newHash }),
    ]);
    expect(consumed.error).toBeNull();
    expect(consumed.data.ok === true || consumed.data.error === 'expired').toBe(true);
    expect(reserved.data.id).toBeTruthy();
    await database.rpc('finish_otp_delivery', { p_phone: NORMALIZED, p_id: reserved.data.id, p_sent: true });
    expect(await verify().run({ phone: PHONE, code: '654321' })).toMatchObject({ status: 200 });
    expect(await verify().run({ phone: PHONE, code: '123456' })).toMatchObject({ body: { error: 'expired' } });
    expect(await count('otp_requests')).toBe('2');
  });

  it('expires old throttle history while keeping phones independent', async () => {
    const sender = request();
    await sender.run({ phone: PHONE });
    expect(await sender.run({ phone: '0700000002' })).toMatchObject({ status: 200 });
    await database.sql("update public.otp_requests set created_at = now() - interval '61 minutes'");
    expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 200 });
    expect(await database.sql(`select count(*) from public.otp_requests where phone = '${NORMALIZED}'`)).toBe('1');
    // Execute exactly the registered cleanup command; no pg_cron daemon needed.
    await database.sql(await database.sql("select command from cron.jobs where name = 'otp-retention-cleanup'"));
    expect(await count('otp_requests')).toBe('1');
  });

  it('denies customer roles access to OTP tables and privileged RPCs', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const call of [
        'select * from public.otp_requests',
        "select public.reserve_otp('+254700000001', repeat('a',64))",
        "select public.consume_otp('+254700000001', repeat('a',64))",
        "select public.finish_otp_delivery('+254700000001', 1, true)",
      ]) await expect(database.sql(`set role ${role}; ${call}`)).rejects.toThrow();
    }
  });

  it.each([null, {}, { error: 'unexpected' }])('fails closed on malformed reservation replies: %s', async data => {
    const sender = request({ rpc: vi.fn(async () => ({ data, error: null })) });
    expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 500, body: { error: 'server_error' } });
    expect(sender.externalFetch).not.toHaveBeenCalled();
  });

  it('fails closed when reservation or consumption is unavailable', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'offline' } }));
    const sender = request({ rpc });
    expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 500, body: { error: 'server_error' } });
    expect(sender.externalFetch).not.toHaveBeenCalled();
    const verifier = verify({ rpc });
    expect(await verifier.run({ phone: PHONE, code: '123456' })).toMatchObject({ status: 500, body: { error: 'server_error' } });
    expect(verifier.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it.each([null, {}, { error: 'unexpected' }])('does not mint a session on malformed consumption replies: %s', async data => {
    const verifier = verify({ rpc: vi.fn(async () => ({ data, error: null })) });
    expect(await verifier.run({ phone: PHONE, code: '123456' })).toMatchObject({ status: 500, body: { error: 'server_error' } });
    expect(verifier.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('seeds the new ledger from the newest five legacy codes during migration', async () => {
    const fixture = createOtpDatabase(`
      insert into public.otp_codes (phone, code_hash, expires_at, created_at)
      select '${NORMALIZED}', repeat('a', 64), now() + interval '5 minutes',
        now() - make_interval(secs => n * 60) from generate_series(1, 7) n;
    `);
    try {
      expect(await fixture.sql('select count(*) from public.otp_requests')).toBe('5');
      const sender = loadHandler('request-otp', fixture);
      expect(await sender.run({ phone: PHONE })).toMatchObject({ body: { error: 'too_many' } });
      expect(sender.externalFetch).not.toHaveBeenCalled();
    } finally { fixture.close(); }
  });

  it('reports delivery-finalization failure without losing the reservation', async () => {
    const sender = request({ rpc: vi.fn((name, params) => name === 'finish_otp_delivery'
      ? { data: null, error: { message: 'offline' } } : database.rpc(name, params)) });
    expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 500, body: { error: 'server_error' } });
    expect(await count('otp_requests')).toBe('1');
    expect(await sender.run({ phone: PHONE })).toMatchObject({ body: { error: 'too_soon' } });
  });
});
