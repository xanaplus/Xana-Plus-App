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
    async run(body, headers = {}) {
      const response = await handler(new Request('https://test.invalid', { method: 'POST', headers, body: JSON.stringify(body) }));
      return { status: response.status, body: await response.json() };
    },
  };
}

describe('OTP atomic server-side boundaries (isolated PostgreSQL)', () => {
  let database;
  beforeAll(() => { database = createOtpDatabase(); }, 30000);
  afterAll(() => database?.close());
  beforeEach(async () => {
    await database.sql(`truncate public.otp_codes, public.otp_requests, public.otp_sms_requests;
      update public.otp_sms_policy set paused = false, minute_limit = 10, hour_limit = 30, day_limit = 60;`);
  });
  const request = options => loadHandler('request-otp', database, options);
  const verify = options => loadHandler('verify-otp', database, options);
  const age = () => database.sql("update public.otp_requests set created_at = created_at - interval '31 seconds'");
  const deliveredCode = sender => sender.messages.at(-1).match(/code is (\d{6})/)[1];
  const count = table => database.sql(`select count(*) from public.${table}`);
  const differentPhone = i => `0700${String(i + 100).padStart(6, '0')}`;

  it('enforces the approved defaults across many phones despite spoofed forwarding headers', async () => {
    const sender = request();
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) =>
      sender.run({ phone: differentPhone(i) }, {
        'x-forwarded-for': `198.51.100.${i}`, 'x-real-ip': `192.0.2.${i}`,
        'forwarded': `for=203.0.113.${i}`, 'cf-connecting-ip': `203.0.113.${i}`,
      })));
    expect(results.filter(r => r.status === 200)).toHaveLength(10);
    expect(results.filter(r => r.status === 429 && r.body.error === 'sms_limit')).toHaveLength(14);
    expect(sender.externalFetch).toHaveBeenCalledTimes(10);
    expect(await count('otp_sms_requests')).toBe('10');
    expect(await count('otp_requests')).toBe('10');
    expect(await count('otp_codes')).toBe('10');
    expect(await database.sql('select minute_limit, hour_limit, day_limit from public.otp_sms_policy')).toBe('10|30|60');
  });

  it.each([
    ['minute', 10, '10 seconds'],
    ['hour', 30, '2 minutes'],
    ['day', 60, '2 hours'],
  ])('admits exactly one concurrent reservation at the %s boundary', async (_window, limit, ageBy) => {
    await database.sql(`insert into public.otp_sms_requests (id, created_at)
      select -n, now() - interval '${ageBy}' from generate_series(1, ${limit - 1}) n`);
    const sender = request();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => sender.run({ phone: differentPhone(i) })));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 429 && r.body.error === 'sms_limit')).toHaveLength(11);
    expect(sender.externalFetch).toHaveBeenCalledTimes(1);
    expect(await count('otp_sms_requests')).toBe(String(limit));
    expect(await count('otp_requests')).toBe('1');
  });

  it.each([
    [10, '10 seconds', '61 seconds'],
    [30, '2 minutes', '61 minutes'],
    [60, '2 hours', '25 hours'],
  ])('recovers when the rolling window for %i reservations expires', async (limit, beforeAge, afterAge) => {
    await database.sql(`insert into public.otp_sms_requests (id, created_at)
      select -n, now() - interval '${beforeAge}' from generate_series(1, ${limit}) n`);
    const sender = request();
    expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 429, body: { error: 'sms_limit' } });
    expect(sender.externalFetch).not.toHaveBeenCalled();
    await database.sql(`update public.otp_sms_requests set created_at = now() - interval '${afterAge}'`);
    expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 200 });
  });

  it('keeps aggregate history through delivery failure, consumption, and per-phone cleanup', async () => {
    const failed = request({ smsThrows: true });
    await failed.run({ phone: PHONE });
    const sender = request();
    await sender.run({ phone: differentPhone(1) });
    await verify().run({ phone: differentPhone(1), code: deliveredCode(sender) });
    await database.sql(`update public.otp_requests set created_at = now() - interval '2 hours';
      update public.otp_sms_requests set created_at = now() - interval '2 hours'`);
    await database.sql(await database.sql("select command from cron.jobs where name = 'otp-retention-cleanup'"));
    expect(await count('otp_requests')).toBe('0');
    expect(await count('otp_codes')).toBe('0');
    expect(await count('otp_sms_requests')).toBe('2');
    const failedMany = request({ smsStatus: 'Failed' });
    for (let i = 0; i < 10; i++) {
      expect(await failedMany.run({ phone: differentPhone(i + 2) })).toMatchObject({ status: 502 });
    }
    expect(await failedMany.run({ phone: differentPhone(20) })).toMatchObject({ status: 429, body: { error: 'sms_limit' } });
    expect(failedMany.externalFetch).toHaveBeenCalledTimes(10);
    expect(await count('otp_sms_requests')).toBe('12');
  });

  it('does not charge rejected per-phone requests to the aggregate ledger', async () => {
    const sender = request();
    for (let i = 0; i < 5; i++) {
      await sender.run({ phone: PHONE });
      expect(await sender.run({ phone: PHONE })).toMatchObject({ body: { error: 'too_soon' } });
      await age();
    }
    expect(await sender.run({ phone: PHONE })).toMatchObject({ body: { error: 'too_many' } });
    expect(await count('otp_sms_requests')).toBe('5');
  });

  it('pauses all non-demo sends without blocking demo sign-in or existing code verification', async () => {
    const sender = request();
    await sender.run({ phone: PHONE });
    const code = deliveredCode(sender);
    await database.sql('update public.otp_sms_policy set paused = true');
    const paused = request();
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => paused.run({ phone: differentPhone(i) })));
    expect(results.every(r => r.status === 503 && r.body.error === 'sms_paused')).toBe(true);
    expect(await paused.run({ phone: '0700000000' })).toMatchObject({ status: 200 });
    expect(paused.externalFetch).not.toHaveBeenCalled();
    expect(await verify().run({ phone: '0700000000', code: '123456' })).toMatchObject({ status: 200 });
    expect(await verify().run({ phone: PHONE, code })).toMatchObject({ status: 200 });
    expect(await count('otp_sms_requests')).toBe('1');
    await database.sql('update public.otp_sms_policy set paused = false');
    expect(await paused.run({ phone: differentPhone(0) })).toMatchObject({ status: 200 });
  });

  it('keeps demo sends exempt when the aggregate budget is exhausted', async () => {
    await database.sql(`insert into public.otp_sms_requests (id, created_at)
      select -n, now() from generate_series(1, 60) n`);
    const sender = request();
    expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 429, body: { error: 'sms_limit' } });
    expect(await sender.run({ phone: '0700000000' })).toMatchObject({ status: 200 });
    expect(sender.externalFetch).not.toHaveBeenCalled();
    expect(await count('otp_sms_requests')).toBe('60');
  });

  it('fails closed on a missing policy while preserving demo behavior', async () => {
    await database.sql('delete from public.otp_sms_policy');
    try {
      const sender = request();
      expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 500, body: { error: 'server_error' } });
      expect(await sender.run({ phone: '0700000000' })).toMatchObject({ status: 200 });
      expect(sender.externalFetch).not.toHaveBeenCalled();
      expect(await count('otp_requests')).toBe('0');
    } finally {
      await database.sql('insert into public.otp_sms_policy (minute_limit, hour_limit, day_limit) values (10, 30, 60)');
    }
  });

  it('rolls back both phone reservation and code if aggregate accounting fails', async () => {
    await database.sql(`create function public.reject_sms_insert() returns trigger language plpgsql as
      $$ begin raise exception 'Simulated accounting failure'; end $$;
      create trigger reject_sms_insert before insert on public.otp_sms_requests
      for each row execute function public.reject_sms_insert()`);
    try {
      const sender = request();
      expect(await sender.run({ phone: PHONE })).toMatchObject({ status: 500, body: { error: 'server_error' } });
      expect(sender.externalFetch).not.toHaveBeenCalled();
      expect(await count('otp_requests')).toBe('0');
      expect(await count('otp_codes')).toBe('0');
      expect(await count('otp_sms_requests')).toBe('0');
    } finally {
      await database.sql('drop trigger reject_sms_insert on public.otp_sms_requests; drop function public.reject_sms_insert()');
    }
  });

  it('only prunes aggregate history older than 24 hours', async () => {
    await database.sql(`insert into public.otp_sms_requests values
      (-1, now() - interval '25 hours'), (-2, now() - interval '23 hours')`);
    await database.sql(await database.sql("select command from cron.jobs where name = 'otp-sms-retention-cleanup'"));
    expect(await database.sql('select id from public.otp_sms_requests')).toBe('-2');
  });

  it('prevents direct aggregate-table edits and bypass of the wrapper', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const statement of [
        'select * from public.otp_sms_requests',
        'delete from public.otp_sms_requests',
        'update public.otp_sms_policy set paused = false',
        "select public.reserve_otp_per_phone('+254700000001', repeat('a',64))",
      ]) await expect(database.sql(`set role ${role}; ${statement}`)).rejects.toThrow();
    }
    await expect(database.sql('update public.otp_sms_policy set minute_limit = 0')).rejects.toThrow();
    await expect(database.sql('update public.otp_sms_policy set hour_limit = 61')).rejects.toThrow();
  });

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
      expect(await fixture.sql('select count(*) from public.otp_sms_requests')).toBe('5');
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
    expect(await count('otp_sms_requests')).toBe('1');
    expect(await sender.run({ phone: PHONE })).toMatchObject({ body: { error: 'too_soon' } });
  });
});
